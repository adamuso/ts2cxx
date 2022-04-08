import ts from "typescript";
import { ParsingContext } from "./parser";

export function binaryOperatorTokenToString(token: ts.BinaryOperatorToken) {
    if (token.kind === ts.SyntaxKind.EqualsToken) {
        return "=";
    }

    return token.getText();
}

export function getSymbolFromIdentifier(context: ParsingContext, identifier: ts.Identifier) {
    if ("symbol" in identifier) {
        return (identifier as any).symbol as ts.Symbol;
    }

    return context.typeChecker.getTypeAtLocation(identifier).symbol;
}

export function getExternCName(declaration: ts.SignatureDeclaration | ts.ClassDeclaration) {
    if (!declaration.decorators) {
        return null;
    }

    const nativeName =
        declaration.decorators && 
        declaration.decorators.filter(d => ts.isCallExpression(d.expression) && d.expression.expression.getText() === "extern_c")[0];

    if (!nativeName || !ts.isCallExpression(nativeName.expression)) {
        return null;
    }

    const arg0 = nativeName.expression.arguments[0];

    if (arg0 && ts.isStringLiteral(arg0)) {
        return arg0.text;
    }

    if (!declaration.name) {
        throw new Error("Name is required");
    }

    return declaration.name.getText();
}

export function getVisibilityFromDeclaration(declaration: ts.PropertyDeclaration | ts.FunctionLikeDeclarationBase) {
    return !declaration.modifiers ? "public" 
        : declaration.modifiers.find(m => m.getText() === "private") ? "private" 
        : declaration.modifiers.find(m => m.getText() === "protected") ? "protected"
        : "public"; 
}

export function groupBy<T, TKey extends string | number | symbol, TValue = T>(arr: T[], key: (v: T) => TKey, value: (v: T) => TValue = (v) => v as any) {
    return arr.reduce((prev, next) => (
        prev[key(next)] ? prev[key(next)].push(value(next)) : prev[key(next)] = [value(next)], prev
    ), {} as { [key in TKey]: TValue[] });

}

export function findNamedDecorator(node: ts.Node, name: string) {
    if (!node.decorators) {
        return null;
    }

    return node.decorators.find(v => ts.isCallExpression(v.expression) 
        && ts.isIdentifier(v.expression.expression) 
        && v.expression.expression.text === name
    ) as ts.Decorator & { expression: ts.CallExpression } | null;
}