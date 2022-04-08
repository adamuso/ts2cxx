import ts from "typescript";
import { parse, ParsingContext } from "./parser";

export function parseVariableStatement(context: ParsingContext, statement: ts.VariableStatement) {
    if (!context.currentFunction) {
        throw new Error("Cannot declare variable outside a function");
    }

    for (let i = 0; i < statement.declarationList.declarations.length; i++) {
        const declaration = statement.declarationList.declarations[i];

        if (!declaration.type) {
            throw new Error("Type is required");
        }

        if (!ts.isIdentifier(declaration.name)) {
            throw new Error("Only identifier is supported");
        }

        context.code.addNewLine = false;
        parse(context, declaration.type);
        context.code.addIndent = false;
        context.append(" ");
        parse(context, declaration.name);

        context.currentFunction.variables.push({
            name: declaration.name,
            type: declaration.type
        });

        if (declaration.initializer) {
            context.append(" = ");
            parse(context, declaration.initializer);
        }

        context.code.addIndent = false;
        context.code.addNewLine = true;
        context.append(";");
        context.code.addIndent = true;
    }
}

export function parseReturnStatement(context: ParsingContext, statement: ts.ReturnStatement) {
    context.code.addNewLine = false;
    context.append("return ");

    context.code.addIndent = false;

    if (statement.expression) {
        parse(context, statement.expression);
    }

    context.code.addIndent = false;
    context.code.addNewLine = true;
    context.append(";");

    context.code.addIndent = true;
}