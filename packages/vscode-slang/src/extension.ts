// ─── SLANG VS Code Extension ───

import * as path from "path";
import { workspace, ExtensionContext } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  // The LSP server is bundled as part of @riktar/slang-lsp
  // Try local workspace node_modules first, then global
  const serverModule = resolveServerPath();

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio },
    debug: { module: serverModule, transport: TransportKind.stdio },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "slang" }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/*.slang"),
    },
  };

  client = new LanguageClient(
    "slang-lsp",
    "SLANG Language Server",
    serverOptions,
    clientOptions,
  );

  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) return undefined;
  return client.stop();
}

function resolveServerPath(): string {
  // Look for the LSP server in common locations
  const candidates = [
    // Workspace node_modules (monorepo)
    path.join(workspace.workspaceFolders?.[0]?.uri.fsPath ?? "", "node_modules", "@riktar", "slang-lsp", "dist", "server.js"),
    // Alongside the extension (bundled)
    path.join(__dirname, "..", "server", "server.js"),
  ];

  // Default: assume globally installed via npx
  // The LanguageClient will resolve via PATH
  return candidates[0];
}
