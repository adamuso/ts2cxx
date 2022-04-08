import ts from "typescript";
import { ParsingContext } from "./parser";
import { getSymbolFromIdentifier } from "./ParserUtil";

export function transformAddThisValue(context: ParsingContext, node: ts.Node): ts.Node {
    node = ts.visitEachChild(node, (n) => transformAddThisValue(context, n), context.transformContext);

    if (ts.isCallExpression(node)) {
        node = transformAddThisValueCallExpression(context, node);
    }

    return node;
}

function transformAddThisValueCallExpression(context: ParsingContext, expression: ts.CallExpression) {
    let symbol: ts.Symbol;
    let thisValue: ts.Expression;

    if (ts.isPropertyAccessExpression(expression.expression) && ts.isIdentifier(expression.expression.name)) {
        symbol = getSymbolFromIdentifier(context, expression.expression.name);  

        if(!symbol || !symbol.declarations) {
            throw new Error("Declaration for a function is required");
        }

        const declaration = symbol.declarations[0];

        if (!ts.isMethodDeclaration(declaration)) {
            throw new Error("Declaration is not a function declaration");
        }

        if (!ts.isClassDeclaration(declaration.parent)) {
            throw new Error("Method parent must be a class");
        }

        thisValue = expression.expression.expression;
    }
    else {
        return expression;
    }

    if (!context.currentFunction) {
        throw new Error("Call cannot be outside a function");
    }

    const symbolsInScope = context.typeChecker.getSymbolsInScope(context.currentFunction.declaration, ts.SymbolFlags.Function);
    const adddressOfSymbol = symbolsInScope.find(v => v.name === "addressof");

    if (!adddressOfSymbol) {
        throw new Error("addressof symbol is missing");
    }

    const addressOfIdentifier = context.typeChecker.symbolToExpression(adddressOfSymbol, ts.SymbolFlags.Function, undefined, undefined);

    if (!addressOfIdentifier) {
        throw new Error("Cannot create addressof identifier");
    }

    return ts.factory.updateCallExpression(
        expression,
        ts.factory.createPropertyAccessExpression(
            ts.factory.createIdentifier("_"),
            context.typeChecker.symbolToEntityName(symbol, ts.SymbolFlags.Function, undefined, undefined) as ts.Identifier,
        ),
        expression.typeArguments,
        [
            ts.factory.createCallExpression(
                addressOfIdentifier,
                undefined,
                [thisValue]
            ),
            ...expression.arguments
        ]
    );
}
