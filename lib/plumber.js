/**
 *
 * Created by uur on 25/06/14.
 */

"use strict";

const Fs = require("fs");
const Path = require("path");
const _ = require("lodash");
const Callsite = require("callsite");
const Clc = require("cli-color");

const Payload = require("./payload");
const BlueprintRoutes = require("./blueprint_routes");

module.exports = {
    pipe: _pipe,
    pipeModels: _pipeModels,
    pipeServices: _pipeServices,
    pipeHooks: _pipeHooks
};

/**
 * Pipe hooks directory into mechanic.hooks
 * object for further usage.
 * Each file exports a single object {availableAfter, fn(request, reply), assign}
 * @returns {[]}
 * @private
 */
function _pipeHooks(hookFilePath) {

    hookFilePath = hookFilePath || "hooks/hooks.js";
    const stack = Callsite();
    const requester = stack[1].getFileName();
    const mainHookFilePath = Path.join(Path.dirname(requester), hookFilePath);

    let hooks = [];

    try {

        const stat = Fs.statSync(mainHookFilePath);
        if (stat.isFile()) {
            hooks = require(mainHookFilePath);
        }
    }
    catch (e) {
        console.log(Clc.red.bold(e));
    }

    if (hooks.length == 0) {
        console.log(Clc.red.bold("Upps. There are not any HOOKS, I guess you're busy with something else :( kib bb"));
    }

    return hooks;
}

/**
 * Pipe Service directory into mechanic.service
 * object for further usage.
 * Each file exports a single function
 * @returns {{}}
 * @private
 */
function _pipeServices(serviceDirectory) {

    serviceDirectory = serviceDirectory || "services";

    const services = {};
    const stack = Callsite();
    const requester = stack[1].getFileName();

    const mainServiceFolder = Path.join(Path.dirname(requester), serviceDirectory);

    try {
        const stat = Fs.statSync(mainServiceFolder);
        if (!stat.isDirectory()) {
            return services;
        }
    }
    catch (e) {
        console.log(Clc.red.bold("Upps. There are not any SERVICES, I guess you're busy with something else :( kib bb"));
        return {};
    }

    const serviceItems = _readDirectoryRecursively(mainServiceFolder, _filterJavascriptFile);

    for (let serviceItem of serviceItems) {

        if (!serviceItem.path) {
            continue;
        }

        // Nested services!
        const relativePath = Path.relative(mainServiceFolder, serviceItem.path);
        let splittedPath = relativePath.split(Path.sep);

        let lastServices = services;

        for (let i = 0; i < splittedPath.length; i++) {

            if (i == splittedPath.length - 1) {
                // !file name
                lastServices[_trimExtFromFileName(serviceItem.name)] = require(serviceItem.path);
                break;
            }

            lastServices[splittedPath[i]] = lastServices[splittedPath[i]] || {};
            lastServices = lastServices[splittedPath[i]];
        }
    }

    return services;
}

/**
 *
 * @returns {{}}
 * @private
 */
function _pipeModels() {

    const models = {};

    const stack = Callsite();
    const requester = stack[1].getFileName();
    const mainPluginFolder = Path.join(Path.dirname(requester), "plugins");

    const pluginFolders = Fs.readdirSync(mainPluginFolder);

    pluginFolders.forEach(function (pluginFolder) {

        pluginFolder = Path.join(mainPluginFolder, pluginFolder);

        if (Fs.existsSync(pluginFolder)) {
            const stat = Fs.statSync(pluginFolder);
            if (stat.isDirectory()) {
                const modelFolder = Path.join(pluginFolder, "model");
                if (Fs.existsSync(modelFolder)) {
                    const stat2 = Fs.statSync(modelFolder);
                    if (stat2.isDirectory()) {
                        _.extend(models, _pipeModelsInFolder(modelFolder));
                    }
                }
            }
        }
    });

    return models;
}

/**
 * Promise for returning all model files.
 * @param {string} folder
 * @return {object}
 */
function _pipeModelsInFolder(folder) {

    const pluginModels = {};
    const modelFsItems = _readDirectoryRecursively(folder, _filterJavascriptFile);

    modelFsItems.forEach(function (modelFsItem) {
        const model = require(modelFsItem.path);
        if (!model.modelName) {
            throw new Error(`There is a file which is not model in "models" folder: ${modelFsItem.path}`);
        }
        pluginModels[_getModelName(modelFsItem.name)] = require(modelFsItem.path);
    });

    return pluginModels;
}

/**
 * Get model name from filename
 * @param fileName
 * @return {string} modelName
 */
function _getModelName(fileName) {

    let filename = _trimExtFromFileName(fileName).toLocaleLowerCase();
    const frags = filename.split("_");
    for (let i = 0; i < frags.length; i++) {
        frags[i] = frags[i].charAt(0).toUpperCase() + frags[i].slice(1);
    }
    filename = frags.join("");

    return filename.charAt(0).toLocaleUpperCase() + filename.slice(1);
}

/**
 * Anything ends with *.js
 * @param fsItem
 * @return {boolean}
 */
function _filterJavascriptFile(fsItem) {

    return /(.*)\.js$/.test(fsItem.name) && !fsItem.stat.isDirectory() && fsItem.name[0] !== "_";
}

function _pipe(plugin, preHooks) {

    if (!plugin) {
        console.log(Clc.red.bold("Pipe's first and only argument must be plugin itself"));
        process.exit(1);
    }

    if (!preHooks || preHooks.length == 0) {
        console.log(Clc.red.bold("Are you sure ? You do not pass any pre hook to this plugin."));
    }

    const stack = Callsite();
    const requester = stack[1].getFileName();

    const pluginOptions = {
        plugin: plugin,
        name: _trimExtFromFileName(Path.basename(requester)),
        mainPath: Path.dirname(requester),
        mainFile: Path.basename(requester),
        preHooks: preHooks,
        routes: [],
        hapiRoutes: [],
        controllers: {},
        controllerDirectory: null
    };

    // Plugin Routes
    const pluginRouteFile = Path.join(pluginOptions.mainPath, _trimExtFromFileName(pluginOptions.mainFile) + "_routes.js");

    try {
        const supposedRouteFile = Fs.statSync(pluginRouteFile);
        if (supposedRouteFile.isFile()) {
            pluginOptions.routes = require(pluginRouteFile);
        }
    }
    catch (e) {
        console.log(e);
    }

    // Plugin ControllerPath
    const pluginControllerDirectory = Path.join(pluginOptions.mainPath, "controller");

    try {
        const supposedControllers = Fs.statSync(pluginControllerDirectory);
        if (supposedControllers.isDirectory()) {
            pluginOptions.controllerDirectory = pluginControllerDirectory;
        }
    }
    catch (e) {
        console.log(e);
    }

    _pipeControllers(pluginOptions);
}

/**
 * Pipe Controller files.
 * @private
 */
function _pipeControllers(pluginOptions) {

    if (!pluginOptions.controllerDirectory) {
        return;
    }

    // Recursively read controllerDirectory
    const fsItems = _readDirectoryRecursively(pluginOptions.controllerDirectory, _filterControllerFile);
    fsItems.forEach((fsItem) => {
        pluginOptions.controllers[_trimExtFromFileName(fsItem.name)] = require(fsItem.path);
    });

    _pipeRoutesJsIntoRoutes(pluginOptions);

    _pipeAllIntoHapi(pluginOptions);
}

/**
 * Pipe routes defined in routes.js into hapiRoutes
 * @param pluginOptions
 * @private
 */
function _pipeRoutesJsIntoRoutes(pluginOptions) {

    if (!pluginOptions.routes || pluginOptions.routes.length == 0) {
        return;
    }

    let controllerName;
    let controllerAction;
    let relatedController;
    let relatedAction;

    pluginOptions.routes.forEach((route) => {

        if (pluginOptions.hapiRoutes[route.path] && pluginOptions.hapiRoutes[route.path]["method"] === route.method) {
            throw new Error(`URL path ( ${route.path}|${pluginOptions.hapiRoutes[route.path]["method"]} defined more than one in routes.js`);
        }

        const config = route.config;
        if ((typeof config == "string" || config instanceof String) && config.indexOf("@") > 0) {
            // config just contain handler.
            controllerName = config.split("@")[0].trim();
            controllerAction = config.split("@")[1].trim();

            relatedController = pluginOptions.controllers[controllerName];
            if (!relatedController) {
                throw new Error("Controller : ( " + controllerName + ".js ) not found");
            }

            relatedAction = relatedController[controllerAction];
            //// Plug & Play with /
            if (typeof relatedAction == "function") {
                relatedAction = {
                    handler: relatedController[controllerAction]
                };
            }
            if (!relatedAction) {
                throw new Error("Controller action -> " + controllerAction + " : ( " + controllerAction + "@" + controllerName + " ) defined in routes.js not found in " + controllerName);
            }

            // Controller and Action found added!
            pluginOptions.hapiRoutes[route.path + "@" + route.method] = {
                method: route.method,
                path: route.path || "GET",
                config: relatedAction
            };
        }
        else { // default blueprint if not contain `@`

            controllerName = config.trim();
            relatedController = pluginOptions.controllers[controllerName];

            if (!relatedController) {
                throw new Error("Controller : ( " + controllerName + ".js ) not found defined in routes.js");
            }

            Object.keys(BlueprintRoutes).forEach((blueprintRoute) => {

                const idParameter = controllerName.substr(0, controllerName.indexOf("_controller")).toLocaleLowerCase();

                const path = route.path + BlueprintRoutes[blueprintRoute].path.replace("{id}", "{" + idParameter + "id}");

                const method = BlueprintRoutes[blueprintRoute].method;

                if (route.except && route.except.indexOf(blueprintRoute) >= 0) {
                    ;//do nothing
                }
                else if (!relatedController[blueprintRoute] && ((blueprintRoute === "sorting") || (blueprintRoute === "sorted") || (blueprintRoute === "delete-info") || (blueprintRoute === "update-info"))) {
                    ;//do nothing
                }
                else if (!relatedController[blueprintRoute]) {
                    console.log("Controller : ( " + controllerName + ".js ) defined as a blueprint in routes.js but " + blueprintRoute + " not found in controller file");
                }
                else {
                    //// Plug & Play with /
                    if (typeof relatedController[blueprintRoute] == "function") {
                        relatedController[blueprintRoute] = {
                            handler: relatedController[blueprintRoute]
                        };
                    }

                    if (!relatedController[blueprintRoute].payload && Payload(blueprintRoute)) {
                        relatedController[blueprintRoute].payload = Payload(blueprintRoute);
                    }

                    if (!relatedController[blueprintRoute].payload && Payload(blueprintRoute)) {
                        relatedController[blueprintRoute].payload = Payload(blueprintRoute);
                    }

                    // Controller and Action found added!
                    pluginOptions.hapiRoutes[path + "@" + method] = {
                        method: method,
                        path: path,
                        config: relatedController[blueprintRoute]
                    };
                }
            });
        }
    });
}

/**
 * *.js -> *
 * @param fileName
 * @return {string}
 * @private
 */
function _trimExtFromFileName(fileName) {
    return fileName && fileName.split(".")[0];
}

/**
 * Anything ends with *Controller.js under "controller" folder.
 * @param fsItem
 * @return {boolean}
 * @private
 */
function _filterControllerFile(fsItem) {
    return /(.*)_controller.js$/.test(fsItem.name) && !fsItem.stat.isDirectory() && fsItem.name[0] !== "_";
}

/**
 * Pipe all routes into plugin
 * @param pluginOptions
 * @private
 */
function _pipeAllIntoHapi(pluginOptions) {

    const routeKeys = Object.keys(pluginOptions.hapiRoutes);

    const labels = _.reduce(pluginOptions.plugin.connections, (labels, connection) => {
        if (connection.settings && connection.settings.labels && connection.settings.labels.length > 0) {
            return labels.concat(connection.settings.labels);
        }
        return labels;
    }, []);

    routeKeys.forEach((routeKey) => {

        if (pluginOptions.preHooks) {

            pluginOptions.hapiRoutes[routeKey].config.pre = [];

            for (let i = pluginOptions.preHooks.length - 1; i >= 0; i--) {

                const pre = pluginOptions.preHooks[i];

                if (pre.plugins && pre.plugins.indexOf(pluginOptions.name) == -1) {
                    continue;
                }

                if (pre.labels && _.intersection(pre.labels, labels).length == 0) {
                    continue;
                }

                if (pre["availableAfter"] && pluginOptions.hapiRoutes[routeKey].path.indexOf(pre["availableAfter"]) == 0) {

                    if (!pluginOptions.hapiRoutes[routeKey].config.pre) {
                        pluginOptions.hapiRoutes[routeKey].config.pre = [];
                    }

                    pluginOptions.hapiRoutes[routeKey].config.pre.unshift({
                        method: pre.method,
                        assign: pre.assign
                    });
                }
            }
        }

        pluginOptions.plugin.route({
            path: pluginOptions.hapiRoutes[routeKey].path,
            method: pluginOptions.hapiRoutes[routeKey].method ? pluginOptions.hapiRoutes[routeKey].method : "GET",
            config: pluginOptions.hapiRoutes[routeKey].config
        });
    });
}

/**
 * Read files in a directory recursively
 * Filter function used filter necessary components
 *
 * @param {string} directoryPath
 * @param {function} filterFunc
 * @returns {object} FsItems
 * @private
 */

function _readDirectoryRecursively(directoryPath, filterFunc) {

    let container = [];
    const items = Fs.readdirSync(directoryPath);

    items.forEach((item) => {
        const path = Path.join(directoryPath, item);
        const stat = Fs.statSync(path);

        if (stat.isDirectory()) {
            container = container.concat(_readDirectoryRecursively(path, filterFunc));
        }
        else {
            const fsItem = {
                path: path,
                stat: stat,
                name: item
            };

            if (filterFunc(fsItem)) {
                container.push(fsItem);
            }
        }
    });

    return container;
}

