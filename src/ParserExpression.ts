import ts from "typescript";
import { FUNCTION_NAME_PREFIX, parse, ParsingContext } from "./parser";
import { binaryOperatorTokenToString, findNamedDecorator, getExternCName, getSymbolFromIdentifier } from "./ParserUtil";

export function parsePropertyAccessExpression(context: ParsingContext, expression: ts.PropertyAccessExpression) {
    if (expression.expression.kind === ts.SyntaxKind.ThisKeyword) {
        if (!context.currentClass) {
            throw new Error("Cannot use 'this' outside a class");
        }

        let parent = expression.parent;

        while(parent && !ts.isConstructorDeclaration(parent) && !ts.isClassDeclaration(parent) && !ts.isSourceFile(parent)) {
            parent = parent.parent;
        }

        context.append("this->" + expression.name.getText());

        return;
    }

    const expressionType = context.typeChecker.getTypeAtLocation(expression.expression);

    if (expressionType.symbol.declarations 
        && expressionType.symbol.declarations[0]
        && findNamedDecorator(expressionType.symbol.declarations[0], "cpp_namespace")
    ) {
        parse(context, expression.expression);

        context.code.addNewLine = false;
        context.append("::" + expression.name.text);

        return;
    }

    if (expressionType.symbol.declarations 
        && expressionType.symbol.declarations[0]
        && !findNamedDecorator(expressionType.symbol.declarations[0], "struct")
    ) {
        parse(context, expression.expression);

        context.code.addNewLine = false;
        context.append("->" + expression.name.text);

        return;
    }

    parse(context, expression.expression);

    context.code.addNewLine = false;
    context.append("." + expression.name.text);
}

export function parseBinaryExpression(context: ParsingContext, expression: ts.BinaryExpression) {
    parse(context, expression.left);
    context.append(" " + binaryOperatorTokenToString(expression.operatorToken) + " ");
    parse(context, expression.right);
}

export function parseNewExpression(context: ParsingContext, expression: ts.NewExpression) {
    let symbol: ts.Symbol;

    if (ts.isIdentifier(expression.expression)) {
        symbol = getSymbolFromIdentifier(context, expression.expression);  

        if(!symbol || !symbol.declarations) {
            throw new Error("Declaration for a function is required");
        }

        const declaration = symbol.declarations[0];

        if (!ts.isClassDeclaration(declaration)) {
            throw new Error("Declaration is not a class declaration");
        }

        const nativeName = getExternCName(declaration);
        
        context.code.addNewLine = false;

        const structDecorator = findNamedDecorator(declaration, "struct");

        if (!structDecorator) {
            context.append("std::make_shared<")   
        }

        if (nativeName) {
            context.append(nativeName);
        }
        else {
            if (!declaration.name) {
                throw new Error("Name is required");
            }

            context.append(FUNCTION_NAME_PREFIX + declaration.name.text);
        }

        if (!structDecorator) {
            context.append(">")   
        }
    }
    else {
        throw new Error("Only identifier is supported");
    }

    context.code.addIndent = false;
    context.append("(");

    if (expression.arguments) {
        for (let i = 0; i < expression.arguments.length; i++) {
            parse(context, expression.arguments[i]);

            if (i < expression.arguments.length - 1) {
                context.code.addIndent = false;
                context.code.addNewLine = false;
                context.append(", ");
            }
        }
    }

    context.code.addIndent = false;
    context.code.addNewLine = false;
    context.append(")");
    
    context.code.addNewLine = true;
    context.code.addIndent = true;
}

export function parseCommaListExpresssion(context: ParsingContext, expression: ts.CommaListExpression) {
    for (let i = 0; i < expression.elements.length; i++) {
        context.code.addIndent = false;
        context.code.addNewLine = false;

        parse(context, expression.elements[i]);

        context.code.addIndent = false;
        context.code.addNewLine = false;
        
        if (i < expression.elements.length - 1) {
            context.append(", ");
        }
    }

    context.code.addIndent = true;
    context.code.addNewLine = true;
}
