# Contributing

## Editor

The recommended editor is Visual Studio Code.

### Extensions

-   ms-vscode.vscode-typescript-tslint-plugin
-   esbenp.prettier-vscode
-   dbaeumer.vscode-eslint
-   peterjausovec.vscode-docker
-   eamodio.gitlens

### ~/.config/Code/User/settings.json

```json
{
    "gitlens.advanced.messages": {
        "suppressShowKeyBindingsNotice": true
    },
    "files.autoSave": "onWindowChange",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
        "source.fixAll.tslint": true
    },
    "typescript.referencesCodeLens.enabled": false,
    "typescript.implementationsCodeLens.enabled": false,
    "gitlens.codeLens.enabled": false,
    "explorer.confirmDelete": false,
    "typescript.updateImportsOnFileMove.enabled": "always",
    "explorer.confirmDragAndDrop": false,
    "editor.suggest.localityBonus": true,
    "files.enableTrash": false,
    "breadcrumbs.enabled": true,
    "javascript.updateImportsOnFileMove.enabled": "always",
    "prettier.requireConfig": true,
    "prettier.ignorePath": ".prettierignore",
    "files.watcherExclude": {
        "**/coverage/lcov-report/**": true
    }
}
```

### ./.vscode/settings.json

```json
{
    "typescript.tsdk": "./node_modules/typescript/lib"
}
```

### ./.vscode/launch.json

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "node",
            "request": "launch",
            "name": "Launch Program",
            "program": "${workspaceFolder}/server/index.js",
            "runtimeArgs": ["--unhandled-rejections=strict", "--require=esm"]
        },
        {
            "type": "node",
            "request": "attach",
            "name": "Attach by Process ID",
            "processId": "${command:PickProcess}"
        },
        {
            "type": "node",
            "request": "launch",
            "name": "Run Tests",
            "args": ["--runInBand", "--no-coverage", "${file}"],
            "cwd": "${workspaceFolder}",
            "console": "integratedTerminal",
            "internalConsoleOptions": "neverOpen",
            "program": "${workspaceFolder}/node_modules/jest/bin/jest"
        }
    ]
}
```

## Development

First of all, install all dependencies and build the project.

```bash
npm i
npm build
```

You might need to reload VS Code, so that it would recognize the generated files: Ctrl+Shift+P -> "Developer: Reload Window".

Aim for full test coverage. Use `jest` directly to re-run tests on change or to limit what tests should be executed, for example:

```bash
npx jest --watch --no-coverage packages/<package-name>/...
```

If you make a change in one package and then want to start working on a different package, run `npm build` and reload VS Code first to ensure that all generated JavaScript code is in sync with the source TypeScript code.

## Publishing Packages

```bash
npx lerna publish
```
