import ts, { createBlock } from "typescript";
import { ParsingContext } from "./parser";
import { getSymbolFromIdentifier } from "./ParserUtil";

export function transformAddressOf(context: ParsingContext, node: ts.Node): ts.Node {
    if (ts.isBlock(node)) {
        return transformAddressOfBlock(context, node);
    }

    node = ts.visitEachChild(node, (n) => transformAddressOf(context, n), context.transformContext);

    return node;
}

function transformAddressOfBlock(context: ParsingContext, block: ts.Block) {
    const visitor = (node: ts.Node, beforeStatements: ts.Statement[]): ts.Node => {
        node = ts.visitEachChild(node, (n) => visitor(n, beforeStatements), context.transformContext);

        if (ts.isCallExpression(node)) {
            node = transformAddressCallExpression(context, beforeStatements, node);
        }

        return node;
    }

    const newStatements: ts.Statement[] = [];
    let updated = false;

    for (let i = 0; i < block.statements.length; i++) {
        const statement = block.statements[i];
        const beforeStatements: ts.Statement[] = []
        const newStatement = ts.visitNode(statement, (n) => visitor(n, beforeStatements)) as ts.Statement;

        if (newStatement !== statement) {
            updated = true;
        }

        if (beforeStatements.length > 0) {
            newStatements.push(...beforeStatements, newStatement);
            updated = true;
        }
        else {
            newStatements.push(newStatement);
        }
    }

    if (updated) {
        return ts.factory.updateBlock(block, newStatements);
    }

    return block;
}

function transformAddressCallExpression(context: ParsingContext, beforeStatements: ts.Statement[], expression: ts.CallExpression) {
    if (!ts.isIdentifier(expression.expression)) {
        return expression;
    }

    const symbol = getSymbolFromIdentifier(context, expression.expression);  

    if(!symbol || !symbol.declarations) {
        throw new Error("Declaration for a function is required");
    }

    const declaration = symbol.declarations[0];

    if (!ts.isFunctionDeclaration(declaration)) {
        throw new Error("Declaration is not a function declaration");
    }

    if (symbol.name !== "addressof") {
        return expression;
    }

    if (!expression.arguments || expression.arguments.length === 0) {
        throw new Error("Argument is required for addressof");
    }

    if (ts.isIdentifier(expression.arguments[0])) {
        return expression;
    }

    if (!context.currentFunction) {
        throw new Error("Call cannot be outside a function");
    }

    const tempIdentifier = ts.factory.createIdentifier(context.currentFunction.generateTempName());
    const tempType = context.typeChecker.getTypeAtLocation(expression.arguments[0]);

    beforeStatements.push(ts.factory.createVariableStatement(
        undefined,
        [ts.factory.createVariableDeclaration(
            tempIdentifier,
            undefined,
            context.typeChecker.typeToTypeNode(tempType, undefined, undefined)
        )]
    )); 

    return ts.factory.createCommaListExpression([
        ts.factory.createAssignment(
            tempIdentifier,
            expression.arguments[0]
        ),
        ts.factory.createCallExpression(
            expression.expression,
            undefined,
            [tempIdentifier]
        )
    ])
}
