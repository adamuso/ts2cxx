import ts from "typescript";
import { FUNCTION_NAME_PREFIX, parse, ParsingContext } from "./parser";
import { getExternCName, getSymbolFromIdentifier } from "./ParserUtil";

export function parseCallExpression(context: ParsingContext, expression: ts.CallExpression) {
    let symbol: ts.Symbol;
    let thisValue: ts.Expression | null = null;

    if (ts.isIdentifier(expression.expression)) {
        symbol = getSymbolFromIdentifier(context, expression.expression);  

        if(!symbol || !symbol.declarations) {
            throw new Error("Declaration for a function is required");
        }

        const declaration = symbol.declarations[0];

        if (!ts.isFunctionDeclaration(declaration)) {
            throw new Error("Declaration is not a function declaration");
        }

        if (symbol.name === "addressof") {
            parseCallExpressionAddressOf(context, expression);
            return;
        }

        if (symbol.name === "sizeof") {
            parseCallExpressionSizeOf(context, expression);
            return;
        }

        const nativeName = getExternCName(declaration);
        
        context.code.addNewLine = false;

        if (nativeName) {
            context.append(nativeName);
        }
        else {
            if (!declaration.name) {
                throw new Error("Name is required");
            }

            context.append(FUNCTION_NAME_PREFIX + declaration.name.getText());
        }
    }
    else if (ts.isPropertyAccessExpression(expression.expression) && ts.isIdentifier(expression.expression.name)) {
        symbol = getSymbolFromIdentifier(context, expression.expression.name);  

        if(!symbol || !symbol.declarations) {
            throw new Error("Declaration for a function is required");
        }

        const declaration = symbol.declarations[0];

        if (!ts.isFunctionLike(declaration)) {
            throw new Error("Declaration is not a function declaration");
        }

        const nativeName = getExternCName(declaration);

        context.code.addNewLine = false;

        if (nativeName) {
            parse(context, expression.expression);
        }
        else {
            if (!declaration.name) {
                throw new Error("Name is required");
            }

            parse(context, expression.expression);

            // context.append(FUNCTION_NAME_PREFIX);
            // parse(context, declaration.parent.name!);
            // context.append("_");
            // parse(context, expression.expression.name);
        }

        thisValue = expression.expression.expression;
    }
    else {
        throw new Error("Only identifier is supported");
    }

    context.code.addIndent = false;
    context.code.addNewLine = false;
    context.append("(");

    // if (thisValue) {
    //     if (!context.currentFunction) {
    //         throw new Error("Call cannot be outside a function");
    //     }

    //     const symbolsInScope = context.typeChecker.getSymbolsInScope(context.currentFunction.declaration, ts.SymbolFlags.Function);
    //     const adddressOfSymbol = symbolsInScope.find(v => v.name === "addressof");
    
    //     if (!adddressOfSymbol) {
    //         throw new Error("addressof symbol is missing");
    //     }
    
    //     const addressOfIdentifier = context.typeChecker.symbolToExpression(adddressOfSymbol, ts.SymbolFlags.Function, undefined, undefined);
    
    //     if (!addressOfIdentifier) {
    //         throw new Error("Cannot create addressof identifier");
    //     }

    //     parse(context, ts.factory.createCallExpression(
    //         addressOfIdentifier,
    //         undefined,
    //         [thisValue]
    //     ));

    //     if (expression.arguments.length > 0) {
    //         context.code.addIndent = false;
    //         context.code.addNewLine = false;
    //         context.append(", ");
    //     }
    // }

    for (let i = 0; i < expression.arguments.length; i++) {
        context.code.addIndent = false;
        context.code.addNewLine = false;
        parse(context, expression.arguments[i]);

        if (i < expression.arguments.length - 1) {
            context.code.addIndent = false;
            context.code.addNewLine = false;
            context.append(", ");
        }
    }

    context.code.addIndent = false;
    context.code.addNewLine = false;
    context.append(")");
    
    context.code.addNewLine = true;
    context.code.addIndent = true;
}

export function parseCallExpressionAddressOf(context: ParsingContext, expression: ts.CallExpression) {
    if (!expression.arguments || expression.arguments.length === 0) {
        throw new Error("Argument is required for addressof");
    }

    // if (!ts.isIdentifier(expression.arguments[0])) {
    //     if (!context.currentFunction) {
    //         throw new Error("Call cannot be outside a function");
    //     }

    //     if (!context.currentStatement) {
    //         throw new Error("addressof cannot be outside a statement");
    //     }

    //     const tempIdentifier = ts.factory.createIdentifier(context.currentFunction.generateTempName());
    //     const tempType = context.typeChecker.getTypeAtLocation(expression.arguments[0]);

    //     context.pushScope(context.currentStatement.before);
    //     parse(context, ts.factory.createVariableStatement(
    //         undefined,
    //         [ts.factory.createVariableDeclaration(
    //             tempIdentifier,
    //             undefined,
    //             context.typeChecker.typeToTypeNode(tempType, undefined, undefined)
    //         )]
    //     )); 
    //     context.popScope(); 

    //     context.append("(");
    //     parse(context, ts.factory.createAssignment(
    //         tempIdentifier,
    //         expression.arguments[0]
    //     ));
        
    //     context.code.addNewLine = false;
    //     context.code.addIndent = false;
    //     context.append(", &");

    //     parse(context, tempIdentifier);

    //     context.code.addNewLine = false;
    //     context.code.addIndent = false;
    //     context.append(")");
    //     return;
    // }

    context.code.addIndent = false;
    context.code.addNewLine = false;

    context.append("&");
    parse(context, expression.arguments[0]);

    context.code.addIndent = true;
    context.code.addNewLine = true;
}

export function parseCallExpressionSizeOf(context: ParsingContext, expression: ts.CallExpression) {
    context.code.addIndent = false;
    context.code.addNewLine = false;

    context.append("sizeof")

    if (expression.typeArguments) {
        if (expression.arguments.length !== 0) {
            throw new Error("If type argument is specified then sizeof cannot have an expression.");
        }
   
        context.append("(");

        if (!expression.typeArguments || expression.typeArguments.length === 0) {
            throw new Error("Type argument is required for sizeof");
        }

        parse(context, expression.typeArguments[0]);

        context.code.addIndent = false;
        context.code.addNewLine = false;
        context.append(")");
    }
    else if (expression.arguments.length === 1) {
        context.append(" ")
        parse(context, expression.arguments[0]);
    }
    else {
        throw new Error("Type argument or an expression is required for sizeof.");
    }
    
    context.code.addNewLine = true;
    context.code.addIndent = true;
}