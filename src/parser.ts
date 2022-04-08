import ts, { addSyntheticLeadingComment } from "typescript"
import * as os from "os";
import { parseClassDeclaration, parseConstructorDeclaration, parseFunctionDeclaration, parseImportDeclaration, parseMethodDeclaration, parseParameterDeclaration, parsePropertyDeclaration } from "./ParserDeclaration";
import { parseReturnStatement, parseVariableStatement } from "./ParserStatement";
import { parseBinaryExpression, parseCommaListExpresssion, parseNewExpression, parsePropertyAccessExpression } from "./ParserExpression";
import { findNamedDecorator, getExternCName, getSymbolFromIdentifier, getVisibilityFromDeclaration, groupBy } from "./ParserUtil";
import { parseCallExpression } from "./ParserCallExpression";

export const FUNCTION_NAME_PREFIX = "tscc_";
export const STRUCT_NAME_PREFIX = "tscc_";

export class CodePrinter {
    code: string;
    indent: number;
    addIndent: boolean;
    addNewLine: boolean;

    constructor() {
        this.code = "";
        this.indent = 0;
        this.addIndent = true;
        this.addNewLine = true;
    }

    pushIndent() {
        this.indent += 1;
    }

    popIndent() {
        if (this.indent >= 1) {
            this.indent -= 1;
        }
    }

    append(text: string) {
        this.code += text.split("\n").map(l => this.addIndent ? " ".repeat(4 * this.indent) + l : l).join("\n") + (this.addNewLine ? os.EOL : "");
    }
}

class ParsingContextFunction {
    returnType?: string;
    namePrefix?: string;
    name?: string;
    parameters: {
        type: string;
        name: string;
    }[];
    hoistedCode: CodePrinter;
    body: CodePrinter;     

    constructor(body: CodePrinter) {
        this.body = body;
        this.hoistedCode = new CodePrinter();
        this.parameters = [];
    }

    printDeclaration(withoutPrefix = false) {
        return `${this.returnType ? this.returnType + " " : ""}${this.namePrefix && !withoutPrefix ? this.namePrefix : ""}${this.name}` +
            `(${this.parameters.map(p => `${p.type} ${p.name}`).join(", ")})`;
    } 

    print() {
        return this.printDeclaration() + os.EOL +
            (this.hoistedCode.code ? this.hoistedCode.code.trim() + os.EOL : "") +
            this.body.code.trim()
    }
}

interface ParsingContextStatement {
    before: CodePrinter;
    content: CodePrinter;
    after: CodePrinter;
    statement: ts.Statement;
}

interface ParsingContextClassField {
    visibility: "public" | "protected" | "private";
    type: string;
    name: string;
}

export class ParsingContext {
    readonly typeChecker: ts.TypeChecker;
    functions: ParsingContextFunction[];
    statementsStack: ParsingContextStatement[];
    codeScope: CodePrinter[];
    currentFunction: {
        func: ParsingContextFunction;
        declaration: ts.FunctionLikeDeclarationBase;
        variables: {
            name: ts.Identifier;
            type: ts.TypeNode;
        }[]
        tempNameIndex: number;
        generateTempName(): string;
    } | null;
    currentClass: { 
        readonly declaration: ts.ClassDeclaration;
        readonly isStruct: boolean;
        readonly name: ts.Identifier;
        readonly fields: ParsingContextClassField[];
        readonly methods: {
            visibility: "public" | "protected" | "private";
            func: ParsingContextFunction;
        }[];
    } | null;

    get currentStatement() {
        return this.statementsStack.length === 0 ? null : this.statementsStack[this.statementsStack.length - 1];
    }

    get code() {
        if (this.codeScope.length <= 0) {
            throw new Error("Empty code scope");
        }

        return this.codeScope[this.codeScope.length - 1];
    }

    constructor(
        readonly program: ts.Program,
        readonly transformContext: ts.TransformationContext
    ) {
        this.typeChecker = program.getTypeChecker();
        this.functions = [];
        this.statementsStack = [];
        this.codeScope = [new CodePrinter()];
        this.currentFunction = null;
        this.currentClass = null;
    }

    pushMethod(declaration: ts.FunctionLikeDeclarationBase) {
        const printer = new CodePrinter();
        const func = new ParsingContextFunction(printer);

        this.currentClass!.methods.push({ 
            visibility: getVisibilityFromDeclaration(declaration), 
            func
        });
        this.pushScope(printer);
        this.currentFunction = {
            func, 
            declaration,
            variables: [],
            tempNameIndex: 0,
            generateTempName() {
                this.tempNameIndex++;
                return "_tscc_temp_" + this.tempNameIndex;
            }
        };

        return this.currentFunction;
    }

    popMethod() {
        this.currentFunction = null;
        this.popScope();
    }

    pushFunction(declaration: ts.FunctionLikeDeclarationBase) {
        const printer = new CodePrinter();
        const func = new ParsingContextFunction(printer);

        this.functions.push(func);
        this.pushScope(printer);
        this.currentFunction = {
            func, 
            declaration,
            variables: [],
            tempNameIndex: 0,
            generateTempName() {
                this.tempNameIndex++;
                return "_tscc_temp_" + this.tempNameIndex;
            }
        };

        return this.currentFunction;
    }

    popFunction() {
        this.currentFunction = null;
        this.popScope();
    }

    pushClass(declaration: ts.ClassDeclaration) {
        if (!declaration.name) {
            throw new Error("Class declaration requires a name");
        }

        this.currentClass = {
            declaration,
            isStruct: Boolean(declaration.decorators && declaration.decorators.find(v => 
                ts.isCallExpression(v.expression) &&
                ts.isIdentifier(v.expression.expression) &&
                v.expression.expression.text === "struct"
            )),
            name: declaration.name!,
            fields: [],
            methods: []
        }
    }

    popClass() {
        const currentClass = this.currentClass!;

        const name = getExternCName(currentClass.declaration);
        const realName = name ? name : STRUCT_NAME_PREFIX + currentClass.declaration.name!.getText();
    
        this.append("class " + realName);
        this.append("{");
        this.pushIndent();
    
        const groupedFields = groupBy(currentClass.fields, (v) => v.visibility);

        for (const visibility in groupedFields) {
            const group = groupedFields[visibility as "public" | "private" | "protected"];

            this.popIndent();
            this.append(visibility + ":");
            this.pushIndent();
            
            for (let i = 0; i < group.length; i++) {
                const field = group[i];

                this.append(field.type + " " + field.name + ";");
            }
        }
        
        const groupedMethods = groupBy(currentClass.methods, (v) => v.visibility);

        for (const visibility in groupedMethods) {
            const group = groupedMethods[visibility as "public" | "private" | "protected"];

            this.popIndent();
            this.append(visibility + ":");
            this.pushIndent();
            
            for (let i = 0; i < group.length; i++) {
                const method = group[i];

                this.append(method.func.printDeclaration(true) + ";");
            }
        }
    
        this.popIndent();
        this.append("};");

        this.append("");
        this.append(this.printFunctions(this.currentClass!.methods.map(v => v.func)));

        this.currentClass = null;
    }

    pushStatement(statement: ts.Statement) {
        const stmt = {
            statement,
            after: new CodePrinter(),
            content: new CodePrinter(),
            before: new CodePrinter()
        };

        this.statementsStack.push(stmt);
        this.pushScope(stmt.content);
    }

    popStatement() {
        this.popScope();

        if (!this.currentStatement) {
            throw new Error("Statement is missing");
        }

        this.code.addNewLine = true;

        this.code.append(
            this.currentStatement.before.code.trim() +
            this.currentStatement.content.code.trim() +
            this.currentStatement.after.code.trim()
        );

        this.statementsStack.pop();
    }


    pushScope(printer = new CodePrinter()) {
        this.codeScope.push(printer);
        return printer;
    }

    popScope() {
        if (this.codeScope.length <= 1) {
            throw new Error("Scope underflow");
        }

        this.codeScope.pop();
    }

    runInNewScope(callback: () => void) {
        const printer = this.pushScope();
        callback();
        this.popScope();
        return printer;
    }

    pushIndent() {
        this.code.pushIndent();
    }

    popIndent() {
        this.code.popIndent();
    }

    append(text: string) {
        this.code.append(text);
    }

    printFunctions(functions = this.functions) {
        return functions.map(f => f.print()).join(os.EOL + os.EOL);
    }
}

export function parseSourceFile(context: ParsingContext, sourceFile: ts.SourceFile) {
    for (let i = 0; i < sourceFile.statements.length; i++) {
        parse(context, sourceFile.statements[i]);
    }
}

export function parseBlock(context: ParsingContext, block: ts.Block) {
    context.append("{");
    context.pushIndent();
    context.code.addIndent = true;

    for (let i = 0; i < block.statements.length; i++) {
        parse(context, block.statements[i]);
    }

    context.code.addIndent = true;
    context.popIndent();
    context.append("}");
}

export function parseTypeReferenceNode(context: ParsingContext, node: ts.TypeReferenceNode) {
    if (ts.isIdentifier(node.typeName) && node.typeName.text === "Ptr") {
        if (!node.typeArguments || node.typeArguments.length <= 0) {
            throw new Error("Type argument is required for Ptr");
        }

        parse(context, node.typeArguments[0]);
        context.code.addIndent = false;
        context.append("*");
        context.code.addIndent = true;
        return;
    }


    const symbol = ts.isIdentifier(node.typeName) 
        ? getSymbolFromIdentifier(context, node.typeName)
        : context.typeChecker.getTypeAtLocation(node.typeName).symbol;

    if (!symbol) {
        context.append(node.typeName.getText())
        return;
    }

    if (!symbol.declarations || symbol.declarations.length === 0) {
        throw new Error("Declaration is required");
    }

    const structDecorator = findNamedDecorator(symbol.declarations[0], "struct");

    if (!structDecorator) {
        context.code.addNewLine = false;
        context.append("std::shared_ptr<");
    }

    context.append(STRUCT_NAME_PREFIX);
    parse(context, node.typeName);

    if (!structDecorator) {
        context.append(">");
    }
}

export function parseIdentifier(context: ParsingContext, identifier: ts.Identifier) {
    context.append(identifier.text);
}

export function parseIfStatement(context: ParsingContext, statement: ts.IfStatement) {
    context.code.addNewLine = false;
    context.append("if (");
    context.code.addIndent = false;
    
    parse(context, statement.expression);
    
    context.code.addNewLine = true;
    context.append(")");
    context.code.addIndent = true;

    parse(context, ts.isBlock(statement.thenStatement) ? statement.thenStatement : ts.factory.createBlock([statement.thenStatement]));
}

export function parse(context: ParsingContext, node: ts.Node) {
    if (node.modifiers && node.modifiers.length >= 1 && node.modifiers.findIndex(v => v.kind === ts.SyntaxKind.DeclareKeyword) >= 0) {

    }
    else if (ts.isSourceFile(node)) {
        parseSourceFile(context, node);
    }
    else if (ts.isFunctionDeclaration(node)) {
        parseFunctionDeclaration(context, node)
    }
    else if (ts.isVariableStatement(node)) {
        context.pushStatement(node);
        parseVariableStatement(context, node);
        context.popStatement();
    }
    else if (ts.isReturnStatement(node)) {
        parseReturnStatement(context, node);
    }
    else if (ts.isImportDeclaration(node)) {
        parseImportDeclaration(context, node);
    }
    else if (ts.isCallExpression(node)) {
        parseCallExpression(context, node);
    }
    else if (ts.isExpressionStatement(node)) {
        context.pushStatement(node);
        context.code.addNewLine = false;
        context.code.addIndent = false;

        parse(context, node.expression);

        context.code.addIndent = false;
        context.code.addNewLine = true;
        context.append(";");
        context.code.addIndent = true;
        context.popStatement();
    }
    else if (ts.isClassDeclaration(node)) {
        parseClassDeclaration(context, node);
    }
    else if (ts.isParameter(node)) {
        parseParameterDeclaration(context, node);
    }
    else if (ts.isBlock(node)) {
        parseBlock(context, node);
    }
    else if (ts.isPropertyDeclaration(node)) {
        parsePropertyDeclaration(context, node);
    }
    else if (ts.isMethodDeclaration(node)) {
        parseMethodDeclaration(context, node);
    }
    else if (ts.isPropertyAccessExpression(node)) {
        parsePropertyAccessExpression(context, node);
    }
    else if (ts.isBinaryExpression(node)) {
        parseBinaryExpression(context, node);
    }
    else if (ts.isPropertyAssignment(node)) {
        debugger;
    }
    else if (ts.isTypeReferenceNode(node)) {
        parseTypeReferenceNode(context, node);
    }
    else if (ts.isConstructorDeclaration(node)) {
        parseConstructorDeclaration(context, node);
    }
    else if (ts.isIdentifier(node)) {
        parseIdentifier(context, node);
    }
    else if (ts.isNewExpression(node)) {
        parseNewExpression(context, node);
    }
    else if (ts.isCommaListExpression(node)) {
        parseCommaListExpresssion(context, node);
    }
    else if (ts.isParenthesizedExpression(node)) {
        context.code.addIndent = false;
        context.code.addNewLine = false;
        
        context.append("(");
        parse(context, node.expression);
        
        context.code.addIndent = false;
        context.code.addNewLine = false;
        
        context.append(")");
        context.code.addIndent = true;
        context.code.addNewLine = true;
    }
    else if (ts.isIfStatement(node)) {
        parseIfStatement(context, node);
    }
    else if (ts.isInterfaceDeclaration(node)) {

    }
    else {
        // console.log("Kind: " + node.kind);
        context.append(node.getText());
    }
}
