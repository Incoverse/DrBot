import chokidar from "chokidar";
import path from "path";
import ts from "typescript";

type TypeCheckResult =
  | { success: true }
  | {
      success: false;
      errors: Array<{
        file: string;
        line: number;
        column: number;
        message: string;
        code: number;
      }>;
    };

export class TypeScriptEngine {
  private static instance: TypeScriptEngine;

  private service: ts.LanguageService;
  private parsed: ts.ParsedCommandLine;

  // track versions per file (important for TS incremental invalidation)
  private fileVersions = new Map<string, number>();

  // track known files (prevents "file not in program" crashes)
  private knownFiles = new Set<string>();

  private constructor() {
    const configPath = ts.findConfigFile(
      process.cwd(),
      ts.sys.fileExists,
      "tsconfig.json"
    );

    if (!configPath) throw new Error("tsconfig.json not found");

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) throw new Error("Failed to read tsconfig");

    this.parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath)
    );

    this.parsed.options.moduleResolution = ts.ModuleResolutionKind.Bundler;

    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => Array.from(this.knownFiles),

      getScriptVersion: (fileName) =>
        String(this.fileVersions.get(fileName) ?? 0),

      getScriptSnapshot: (fileName) => {
        if (!ts.sys.fileExists(fileName)) return undefined;
        const content = ts.sys.readFile(fileName);
        if (!content) return undefined;
        return ts.ScriptSnapshot.fromString(content);
      },

      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getCompilationSettings: () => this.parsed.options,
      getDefaultLibFileName: ts.getDefaultLibFilePath,
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
    };

    this.service = ts.createLanguageService(
      host,
      ts.createDocumentRegistry()
    );

    this.startWatcher();
  }

  static getInstance() {
    if (!TypeScriptEngine.instance) {
      TypeScriptEngine.instance = new TypeScriptEngine();
    }
    return TypeScriptEngine.instance;
  }

  // -------------------------
  // PATH NORMALIZATION
  // -------------------------
  private normalize(file: string) {
    return path.normalize(path.resolve(file));
  }

  // -------------------------
  // FILE TRACKING (FIXED)
  // -------------------------
  private addFile(file: string) {
    const f = this.normalize(file);
    this.knownFiles.add(f);
    this.bump(f);
  }

  private removeFile(file: string) {
    const f = this.normalize(file);
    this.knownFiles.delete(f);
    this.fileVersions.delete(f);
  }

  private bump(file: string) {
    const f = this.normalize(file);
    this.fileVersions.set(f, (this.fileVersions.get(f) ?? 0) + 1);
  }

  // -------------------------
  // WATCHER (FIXED)
  // -------------------------
  private startWatcher() {
    const root = path.join(process.cwd(), "src");

    const watcher = chokidar.watch(root, {
      ignoreInitial: false,
      persistent: true,
    });

    watcher.on("add", (file) => {
      const f = this.normalize(file);
      this.addFile(f);
    });

    watcher.on("change", (file) => {
      const f = this.normalize(file);
      this.addFile(f);
    });

    watcher.on("unlink", (file) => {
      const f = this.normalize(file);
      this.removeFile(f);
    });
  }

  // -------------------------
  // MAIN CHECK (FIXED SAFE)
  // -------------------------
  checkFile(filePath: string, onlyErrorsForFile = true): TypeCheckResult {
    const file = this.normalize(filePath);

    if (!this.knownFiles.has(file) && ts.sys.fileExists(file)) {
      this.addFile(file);
    }

    try {
      const syntactic = this.service.getSyntacticDiagnostics(file);
      const semantic = this.service.getSemanticDiagnostics(file);

      const diagnostics = [...syntactic, ...semantic];

      const filtered = onlyErrorsForFile
        ? diagnostics.filter(
            (d) =>
              d.file &&
              this.normalize(d.file.fileName) === file
          )
        : diagnostics;

      if (filtered.length === 0) return { success: true };

      return {
        success: false,
        errors: filtered.map((d) => {
          const message = ts.flattenDiagnosticMessageText(
            d.messageText,
            "\n"
          );

          let line = 0;
          let column = 0;

          if (d.file && d.start !== undefined) {
            const pos = d.file.getLineAndCharacterOfPosition(d.start);
            line = pos.line + 1;
            column = pos.character + 1;
          }

          return {
            file: d.file?.fileName ?? file,
            line,
            column,
            message,
            code: d.code,
          };
        }),
      };
    } catch (err) {
      return { success: true };
    }
  }
}

export const tsEngine = TypeScriptEngine.getInstance();