import ts, { CallExpression, StringLiteral } from "typescript";
import { FUNCTION_NAME_PREFIX, parse, ParsingContext, STRUCT_NAME_PREFIX } from "./parser";
import { getExternCName, getSymbolFromIdentifier, getVisibilityFromDeclaration } from "./ParserUtil";
import { transformAddressOf } from "./TransformAddressOf";
import { transformAddThisValue } from "./TransformAddThisValue";
import { transformBlockScopeDestructors } from "./TransformBlockScopeDestructors";

export function parseImportDeclaration(context: ParsingContext, declaration: ts.ImportDeclaration) {
    if (!ts.isStringLiteral(declaration.moduleSpecifier)) {
        throw new Error("Only string literal as module specifier is supported");
    }

    context.append("#include <" + declaration.moduleSpecifier.text + ">");

    if (!declaration.importClause || !declaration.importClause.namedBindings || !ts.isNamedImports(declaration.importClause.namedBindings)) {
        return;
    } 

    if (!declaration.importClause.namedBindings.elements.length) {
        return;
    }

    const firstBindingType = context.typeChecker.getTypeAtLocation(declaration.importClause.namedBindings.elements[0]);
    const moduleDeclaration = firstBindingType.symbol.declarations![0].parent.parent;
    const decorator = moduleDeclaration?.decorators?.find(v => ts.isCallExpression(v.expression) && v.expression.expression.getText() === "cpp_namespace");
    const name = ((decorator?.expression as CallExpression).arguments[0] as StringLiteral).text;

    if (!name) {
        return;
    }

    for (let i = 0; i < declaration.importClause.namedBindings.elements.length; i++) {
        const binding = declaration.importClause.namedBindings.elements[i];

        context.append("using " + name + "::" + binding.name.text + ";");
    } 

    // if (!declaration.importClause?.namedBindings || !ts.isNamedImports(declaration.importClause.namedBindings)) {
    //     throw new Error("Import clause is required");
    // }

    // for (let i = 0; i < declaration.importClause.namedBindings.elements.length; i++) {
    //     const element = declaration.importClause.namedBindings.elements[i];


    // }
}

export function parseClassDeclaration(context: ParsingContext, declaration: ts.ClassDeclaration) {
    context.pushClass(declaration);

    for (let i = 0; i < declaration.members.length; i++) {
        parse(context, declaration.members[i]);
    }

    context.popClass();
}

export function parsePropertyDeclaration(context: ParsingContext, declaration: ts.PropertyDeclaration) {
    if (!declaration.type) {
        throw new Error("Type is required");
    }

    if (!context.currentClass) {
        throw new Error("Property declaration outside class");
    }

    context.currentClass.fields.push({
        visibility: getVisibilityFromDeclaration(declaration),
        type: declaration.type.getText(),
        name: declaration.name.getText()
    })

    // context.append(declaration.type.getText() + " " + declaration.name.getText() + ";");
}

export function parseMethodDeclaration(context: ParsingContext, declaration: ts.MethodDeclaration) {
    if (!declaration.body) {
        throw new Error("Body is required");
    }

    if (!context.currentClass) {
        throw new Error("Method outside class");
    }

    const funcContext = context.pushMethod(declaration);

    let funcName = declaration.name.getText();
    
    if (funcName === "destructor") {
        funcContext.func.returnType = undefined;
        funcName = "~" + FUNCTION_NAME_PREFIX + context.currentClass.name.text;
    }
    else {
        funcContext.func.returnType = context.runInNewScope(() => {
            if (!declaration.type) {
                throw new Error("Type is required");
            }

            context.code.addNewLine = false;
            parse(context, declaration.type);
        }).code;
    }

    funcContext.func.namePrefix = FUNCTION_NAME_PREFIX + context.currentClass.name.text + "::";
    funcContext.func.name = funcName;

    for (let i = 0; i < declaration.parameters.length; i++) {
        parse(context, declaration.parameters[i]);
    }

    context.code.addNewLine = true;
    context.code.addIndent = true;

    parse(context, declaration.body);

    context.popMethod();

    // context.append(funcContext.func.printDeclaration(true) + ";");
}

export function parseConstructorDeclaration(context: ParsingContext, declaration: ts.ConstructorDeclaration) {
    if (!declaration.body) {
        throw new Error("Body is required");
    }

    if (!context.currentClass) {
        throw new Error("Constructor outside class");
    }
   
    const funcContext = context.pushMethod(declaration);
    
    funcContext.func.returnType = undefined;
    funcContext.func.namePrefix = FUNCTION_NAME_PREFIX + context.currentClass.name.text + "::";
    funcContext.func.name = FUNCTION_NAME_PREFIX + context.currentClass.name.text;

    for (let i = 0; i < declaration.parameters.length; i++) {
        parse(context, declaration.parameters[i]);
    }

    context.code.addNewLine = true;
    context.code.addIndent = true;

    const symbolsInScope = context.typeChecker.getSymbolsInScope(declaration, ts.SymbolFlags.Function);
    const allocatorSymbol = symbolsInScope.find(v => v.name === "tscc_allocator_alloc");

    if (!allocatorSymbol) {
        throw new Error("tscc_allocator_alloc symbol is missing");
    }

    const allocatorIdentifier = context.typeChecker.symbolToExpression(allocatorSymbol, ts.SymbolFlags.Function, undefined, undefined);

    if (!allocatorIdentifier) {
        throw new Error("Cannot create allocator identifier");
    }

    const sizeOfSymbol = symbolsInScope.find(v => v.name === "sizeof");

    if (!sizeOfSymbol) {
        throw new Error("sizeof symbol is missing");
    }

    const sizeOfIdentifier = context.typeChecker.symbolToExpression(sizeOfSymbol, ts.SymbolFlags.Function, undefined, undefined);

    if (!sizeOfIdentifier) {
        throw new Error("Cannot create allocator identifier");
    }

    parse(context, declaration.body);

    context.popMethod();

    // context.append(funcContext.func.printDeclaration(true) + ";");
}

export function parseFunctionDeclaration(context: ParsingContext, declaration: ts.FunctionDeclaration) {
    if (!declaration.type) {
        throw new Error("Type is required");
    }

    if (!declaration.body) {
        throw new Error("Body is required");
    }
    
    if (!declaration.name) {
        throw new Error("Name is required");
    }

    const funcContext = context.pushFunction(declaration);
    const name = getExternCName(declaration);
    
    funcContext.func.returnType = context.runInNewScope(() => {
        if (!declaration.type) {
            throw new Error("Type is required");
        }

        context.code.addNewLine = false;
        parse(context, declaration.type);
    }).code;

    funcContext.func.name = name ? name : FUNCTION_NAME_PREFIX + declaration.name.getText();
    
    for (let i = 0; i < declaration.parameters.length; i++) {
        parse(context, declaration.parameters[i]);
    }

    context.code.addNewLine = true;
    context.code.addIndent = true;

    // const bodyWithThisValues = transformAddThisValue(context, declaration.body);
    // const bodyWithAddressOf = transformAddressOf(context, bodyWithThisValues);
    // const newBodyWithDestructors = transformBlockScopeDestructors(context, bodyWithAddressOf);
    parse(context, declaration.body);

    context.popFunction();
}

export function parseParameterDeclaration(context: ParsingContext, declaration: ts.ParameterDeclaration) {
    if (!context.currentFunction) {
        throw new Error("Parameter outside a function/method/constructor");
    }

    const paramType = context.runInNewScope(() => {
        if (!declaration.type) {
            throw new Error("Type is required");
        }
        
        context.code.addNewLine = false;
        parse(context, declaration.type);
    });

    const paramName = context.runInNewScope(() => {         
        if (!ts.isIdentifier(declaration.name)) {
            throw new Error("Only identifier is supported");
        }

        context.code.addNewLine = false;
        parse(context, declaration.name);
    });

    context.currentFunction.func.parameters.push({
        name: paramName.code,
        type: paramType.code
    });
}
