// Metro: the app shares the collection, scheduler, search, templates and courses with the web app
// (../src/lib), so those files are watched and bundled here too.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../src/lib');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];

// Bare imports from the shared code (just `react`) must resolve to this app's node_modules, not the
// web app's, or there would be two copies of React.
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const ctx =
    context.originModulePath.startsWith(sharedRoot) && !moduleName.startsWith('.')
      ? { ...context, originModulePath: path.join(projectRoot, 'package.json') }
      : context;
  return resolve ? resolve(ctx, moduleName, platform) : ctx.resolveRequest(ctx, moduleName, platform);
};

module.exports = config;
