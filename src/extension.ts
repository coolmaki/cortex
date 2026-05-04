import * as vscode from 'vscode';
import { NexusService } from './nexus/service';
import { FrontmatterService } from './frontmatter/service';
import { CortexExplorerProvider } from './tree/explorer';
import { ReaderProvider } from './reader/provider';
import { createStatusBar } from './statusbar/statusbar';
import { registerCommands } from './commands/index';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const nexus = new NexusService(context);
  await nexus.scan();
  context.subscriptions.push(nexus);

  const frontmatter = new FrontmatterService();
  const reader = new ReaderProvider(context.extensionUri, frontmatter);
  context.subscriptions.push(reader);

  const explorerProvider = new CortexExplorerProvider(nexus);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('cortex.explorer', explorerProvider),
  );

  context.subscriptions.push(createStatusBar(nexus));
  registerCommands(context, nexus, explorerProvider, reader);
}

export function deactivate(): void {}
