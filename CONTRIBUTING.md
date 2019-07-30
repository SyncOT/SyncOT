# Contributing

## Editor

The recommended editor is [Visual Studio Code](https://code.visualstudio.com/). The config that works well with this project is [here](https://gist.github.com/gkubisa/331ba8b586720f3f0af353c666eb3b7d) and can be set up easily using [Settings Sync](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync).

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
