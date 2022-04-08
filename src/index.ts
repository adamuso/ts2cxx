import ts from "typescript";
import * as os from "os";
import { parse, ParsingContext } from "./parser";

const path = ts.findConfigFile("./", ts.sys.fileExists);

if (!path) {
    throw new Error("tsconfig.json not found");
}

const configResult = ts.readConfigFile(path, ts.sys.readFile);

if (!configResult.config) {
    console.error(configResult.error);
    throw new Error("Config cannot be parsed");
}

if (configResult.error) {
    console.warn(configResult.error);
}

const parsedConfig = ts.parseJsonConfigFileContent(configResult.config, ts.sys, "./")
// parsedConfig.options.noEmit = true;
parsedConfig.options.declaration = true;
// parsedConfig.options.emitDeclarationOnly = true;

const program = ts.createProgram({
    options: parsedConfig.options,
    rootNames: parsedConfig.fileNames,
    configFileParsingDiagnostics: parsedConfig.errors
});

const emitResult = program.emit(
    undefined,
    () => {},
    undefined,
    undefined,
    {
        before: [
            (transformContext: ts.TransformationContext) => {
                return (x: ts.SourceFile) => {
                    const context = new ParsingContext(program, transformContext);
                    parse(context, x);

                    console.log(context.code.code);
                    console.log(context.printFunctions());

                    return x;
                };
            }
        ]
    }
);

const diagnostics = parsedConfig.errors.concat(ts.getPreEmitDiagnostics(program), emitResult.diagnostics); 

console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
    getCanonicalFileName: f => f,
    getNewLine: () => os.EOL
}));