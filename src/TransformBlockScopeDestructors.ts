import ts from "typescript";
import { ParsingContext } from "./parser";
import { getSymbolFromIdentifier } from "./ParserUtil";

interface AnalyseContext {
    scopeVariables: { name: ts.Identifier, type: ts.TypeNode }[][]
}

export function transformBlockScopeDestructors(parsingContext: ParsingContext, block: ts.Node) {
    // Every return
    // End of each block
    // break/continue in loop
    // switch?   

    return analyseVariablesAndReturnsParse(parsingContext, { scopeVariables: [] }, block);
}

function analyseVariablesAndReturnsParseVariableDeclaration(parsingContext: ParsingContext, context: AnalyseContext, declaration: ts.VariableDeclaration) {
    if (!declaration.type) {
        throw new Error("Type is required");
    }

    if (!ts.isIdentifier(declaration.name)) {
        throw new Error("Only identifier is supported");
    }

    const scope = context.scopeVariables[context.scopeVariables.length - 1];
    scope.push({
        name: declaration.name,
        type: declaration.type
    });
}

function analyseVariablesAndReturnsParseBlock(parsingContext: ParsingContext,context: AnalyseContext, block: ts.Block) {
    context.scopeVariables.push([]);

    block = ts.visitEachChild(block, (n) => analyseVariablesAndReturnsParse(parsingContext, context, n), parsingContext.transformContext);

    let blockBreakIndex = block.statements.findIndex(s => ts.isReturnStatement(s))
    blockBreakIndex = blockBreakIndex < 0 ? block.statements.findIndex(s => ts.isBreakOrContinueStatement(s)) : blockBreakIndex;

    if (blockBreakIndex >= 0) {
        const destructors = generateDestructors(parsingContext, context.scopeVariables.flat());
        const beforeStatements = block.statements.slice(0, blockBreakIndex);
        const afterStatements = block.statements.slice(blockBreakIndex, block.statements.length);

        context.scopeVariables.pop();
        return ts.factory.createBlock([
            ...beforeStatements,
            ...destructors,
            ...afterStatements
        ]);
    }
    else if (context.scopeVariables.length > 0) {
        const destructors = generateDestructors(parsingContext, context.scopeVariables[context.scopeVariables.length - 1]);

        context.scopeVariables.pop();
        return ts.factory.createBlock([
            ...block.statements,
            ...destructors
        ]);
    }

    context.scopeVariables.pop();
    return block;
}

function analyseVariablesAndReturnsParse(parsingContext: ParsingContext, context: AnalyseContext, node: ts.Node): ts.Node {
    if (ts.isVariableDeclaration(node)) {
        analyseVariablesAndReturnsParseVariableDeclaration(parsingContext, context, node);
        return node;
    }
    else if (ts.isBlock(node)) {
        return analyseVariablesAndReturnsParseBlock(parsingContext, context, node);
    }
    else if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isArrowFunction(node)) {
        return node;
    }
        
    return ts.visitEachChild(node, (n) => analyseVariablesAndReturnsParse(parsingContext, context, n), parsingContext.transformContext);
}

function generateDestructors(context: ParsingContext, variables: { name: ts.Identifier, type: ts.TypeNode }[]): ts.Statement[] {
    const result = [];

    variables = variables.reverse();
    for (let i = 0; i < variables.length; i++) {
        const variable = variables[i];
        
        if (!ts.isTypeReferenceNode(variable.type)) {
            continue;
        }

        if (!ts.isIdentifier(variable.type.typeName)) {
            throw new Error("Type name must be an identifier");
        }

        const classSymbol = getSymbolFromIdentifier(context, variable.type.typeName);

        if (!classSymbol) {
            continue;
        }

        if (!classSymbol.declarations || classSymbol.declarations.length === 0) {
            throw new Error("Missing class declaration. Cannot generate destructor.");
        }

        const classDeclaration = classSymbol.declarations[0];

        if (!ts.isClassDeclaration(classDeclaration)) {
            throw new Error("Should be class declaration");
        }

        const destructor = classDeclaration.members.find(m => ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === "destructor");

        if (!destructor) {
            continue;
        }

        result.push(ts.factory.createExpressionStatement(
            ts.factory.createCallExpression(
                ts.factory.createPropertyAccessExpression(
                    variables[i].name,
                    destructor.name as ts.Identifier
                ),
                undefined,
                [variables[i].name]
            )
        ));
    }

    return result;
}