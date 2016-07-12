/**
 * Next Plumber !
 *
 * Controllers & Services & Models
 *
 */

"use strict";

const _ = require("lodash");
const Path = require("path");
const Fs = require("fs");

const Colors = require("colors/safe");
const Callsite = require("callsite");

const BlueprintRoutes = require("./blueprint_routes");
const Payload = require("./payload");

Colors.setTheme({
    info: "green",
    error: "red",
    warn: "yellow"
});

module.exports = {
    pipeRoutes,
    pipeHooks,
    pipeModels,
    pipeServices
};

/**
 * Pipe Service directory into mechanic.service
 * object for further usage.
 * Each file exports a single function
 * @returns {{}}
 * @private
 */
function pipeServices(serviceDirectory) {

    try {
        const supposedServiceDirectory = Fs.statSync(serviceDirectory);
        if (!supposedServiceDirectory.isDirectory()) {
            throw new Error("Given path is not a directory");
        }
    }
    catch (e) {
        console.log(Colors.error(e));
        console.log(Colors.error("Service folder not found in the given location: " + serviceDirectory));
        return {};
    }

    const serviceFsItems = _readDirectoryRecursively(serviceDirectory, _filterJavascriptFile);
    const services = {};

    for (let serviceFsItem of serviceFsItems) {

        if (!serviceFsItem.path) {
            continue;
        }

        // Nested services!
        const relativePath = Path.relative(serviceDirectory, serviceFsItem.path);
        let splittedPath = relativePath.split(Path.sep);

        let lastServices = services;

        for (let i = 0; i < splittedPath.length; i++) {

            if (i == splittedPath.length - 1) {
                // !file name
                lastServices[_trimExtFromFileName(serviceFsItem.name)] = require(serviceFsItem.path);
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
 * @params {string} [searchDirectory]
 * Recursively search given folder for "models" folder,
 * and imports related content
 *
 * @return {{}}
 */
function pipeModels(searchDirectory) {

    const stack = Callsite();
    const requester = stack[1].getFileName();
    const calledDirectory = Path.dirname(requester);

    if (!searchDirectory) {
        searchDirectory = Path.join(calledDirectory, "plugins");
    }

    const models = {};
    return _pipeModels(searchDirectory, searchDirectory, models);
}

/**
 *
 * @param mainDirectory
 * @param searchDirectory
 * @param models
 * @returns {{}}
 * @private
 */
function _pipeModels(mainDirectory, searchDirectory, models) {

    const items = Fs.readdirSync(searchDirectory);
    let isParentModelFolder = searchDirectory.split(Path.sep).includes("models") || searchDirectory.split(Path.sep).includes("model");

    for (let item of items) {

        const itemPath = Path.join(searchDirectory, item);
        const stat = Fs.statSync(itemPath);

        if (stat.isFile() && isParentModelFolder) {

            const model = require(itemPath);
            if (!model["modelName"]) {
                throw new Error(`There is a file which is not model in "models" folder: ${itemPath}`);
            }
            models[_getModelName(item)] = model;
        }

        if (stat.isDirectory()) {
            _pipeModels(mainDirectory, itemPath, models);
        }
    }

    return models;
}

/**
 * Pipe hooks directory into mechanic.hooks
 * object for further usage.
 * Each file exports a single object {availableAfter, method(request, reply), assign}
 * @params hookFile
 * @returns {[]}
 */
function pipeHooks(hookFile) {

    let hooks = [];

    try {

        const stat = Fs.statSync(hookFile);
        if (!stat.isFile()) {
            throw new Error("Given path is not a file");
        }
        hooks = require(hookFile);
    }
    catch (e) {
        console.log(Colors.error(e));
        console.log(Colors.error("Hooks file not found in the given location: " + hookFile));
    }

    if (hooks.length == 0) {
        console.log(Colors.error("Upps. There are not any HOOKS, I guess you're busy with something else :( kib bb"));
    }

    return hooks;
}

/**
 * @param server
 * @param hooks
 * @param {string} routeFile
 * @param {string} [controllerDirectory]
 */
function pipeRoutes(server, hooks, routeFile, controllerDirectory) {

    const plumber = {};

    const stack = Callsite();
    const requester = stack[1].getFileName();
    const calledDirectory = Path.dirname(requester);

    if (!controllerDirectory) {
        controllerDirectory = Path.join(calledDirectory, "controller");
    }

    routeFile = Path.join(calledDirectory, routeFile);

    try {
        const supposedRouteFile = Fs.statSync(routeFile);
        if (!supposedRouteFile.isFile()) {
            throw new Error("Given path is not a file");
        }
        plumber.routeConfigs = require(routeFile);
    }
    catch (e) {
        console.log(Colors.error(e));
        console.log(Colors.error("Route file not found in the given location: " + routeFile));
        return;
    }

    if (!plumber.routeConfigs || plumber.routeConfigs.length == 0) {
        console.log(Colors.info("are u sure bro? there is not any routes here."));
    }

    try {
        const supposedControllers = Fs.statSync(controllerDirectory);
        if (!supposedControllers.isDirectory()) {
            throw new Error("Given path is not a directory");
        }
        plumber.controllerDirectory = controllerDirectory;
    }
    catch (e) {
        console.log(Colors.error(e));
        console.log(Colors.error("Controller directory not found in the given location: " + controllerDirectory));
        return;
    }

    _pipeControllers(server, hooks, plumber);
}

/**
 *
 * @param server
 * @param hooks
 * @param plumber
 * @private
 */
function _pipeControllers(server, hooks, plumber) {

    // Recursively read controllerDirectory
    const controllerFiles = _readDirectoryRecursively(plumber.controllerDirectory, _filterControllerFile);

    if (!controllerFiles || controllerFiles.length == 0) {
        console.log(Colors.info("are u sure bro? there is not any controller file here."));
    }

    plumber.controllers = {};
    plumber.routes = {};

    for (let controllerFile of controllerFiles) {
        plumber.controllers[_trimExtFromFileName(controllerFile.name)] = require(controllerFile.path);
    }

    plumber = _getRoutes(plumber);
    _pipeRoutes(server, hooks, plumber);
}

/**
 * @param server
 * @param hooks
 * @param plumber
 * @private
 */
function _pipeRoutes(server, hooks, plumber) {

    const labels = _.reduce(server.connections, (labels, connection) => {
        if (connection.settings && connection.settings.labels && connection.settings.labels.length > 0) {
            return labels.concat(connection.settings.labels);
        }
        return labels;
    }, []);

    const routeKeys = Object.keys(plumber.routes);

    for (let routeKey of routeKeys) {

        if (hooks && hooks.length > 0) { // hooks exist, but is it really belongs to this route?

            plumber.routes[routeKey].config.pre = [];

            for (let i = hooks.length - 1; i >= 0; i--) {

                const hook = hooks[i];

                if (hook["labels"] && _.intersection(hook["labels"], labels).length == 0) {
                    continue;
                }

                if (hook["availableAfter"] && plumber.routes[routeKey].path.indexOf(hook["availableAfter"]) == 0) {

                    plumber.routes[routeKey].config.pre.unshift({
                        method: hook.method,
                        assign: hook.assign
                    });
                }
            }
        }

        server.route({
            path: plumber.routes[routeKey].path,
            method: plumber.routes[routeKey].method,
            config: plumber.routes[routeKey].config
        });
    }
}

/**
 * @param plumber
 * @return plumber
 * @private
 */
function _getRoutes(plumber) {

    for (let routeConfig of plumber.routeConfigs) {

        if (plumber.routes[routeConfig.path] && plumber.routes[routeConfig.path]["method"] === routeConfig.method) {
            throw new Error(`URL path ( ${routeConfig.path}|${plumber.routes[routeConfig.path]["method"]} defined more than one in route file`);
        }

        const action = routeConfig.action || routeConfig.config;

        if (!action) {
            throw new Error(`Invalid route ${routeConfig}`);
        }

        if (action.indexOf("@") != -1) {

            // Single route

            const controllerName = action.split("@")[0].trim();
            const controllerAction = action.split("@")[1].trim();

            const relatedController = plumber.controllers[controllerName];
            if (!relatedController) {
                throw new Error(`Controller : ( ${controllerName} ) not found`);
            }

            const relatedAction = relatedController[controllerAction];
            if (!relatedAction) {
                throw new Error(`Controller action -> ${controllerAction} : ( ${controllerAction}"@"${controllerName} ) defined in routes not found in ${controllerName}`);
            }

            // Controller and Action found added!
            plumber.routes[routeConfig.path + "@" + (routeConfig.method || "get")] = {
                method: routeConfig.method || "get",
                path: routeConfig.path,
                config: typeof relatedAction == "function" ? {handler: relatedAction} : relatedAction
            };

        }
        else {

            const controllerName = action.trim();

            // Blueprint route
            const relatedController = plumber.controllers[controllerName];
            if (!relatedController) {
                throw new Error(`Controller : ( ${controllerName} ) not found`);
            }

            const blueprintRoutes = Object.keys(BlueprintRoutes);
            const except = routeConfig.except;

            for (let blueprintRoute of blueprintRoutes) {

                if (except && except.indexOf(blueprintRoute) != -1) {
                    // Except these! yey!
                    continue;
                }

                if (!relatedController[blueprintRoute] && (blueprintRoute == "sorting" || blueprintRoute == "sorted")) {
                    // Sorting and Sorted may not be implemented.
                    continue;
                }

                if (!relatedController[blueprintRoute]) {
                    console.log(Colors.error(`Controller: ( ${controllerName} ) defined as a blueprint in routes but "${blueprintRoute}" not found in controller file`));
                    continue;
                }

                const parameterName = controllerName.substr(0, controllerName.indexOf("_controller")).toLocaleLowerCase();
                const path = routeConfig.path + BlueprintRoutes[blueprintRoute].path.replace("{id}", "{" + parameterName + "id}");
                const method = BlueprintRoutes[blueprintRoute].method;

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
                plumber.routes[path + "@" + method] = {
                    method: method,
                    path: path,
                    config: relatedController[blueprintRoute]
                };

            }
        }

    }

    return plumber;
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
 * Anything ends with *.js
 * @param fsItem
 * @return {boolean}
 */
function _filterJavascriptFile(fsItem) {

    return /(.*)\.js$/.test(fsItem.name) && !fsItem.stat.isDirectory() && fsItem.name[0] !== "_";
}

/**
 * Get model name from filename
 * @param fileName
 * @return {string} modelName
 */
function _getModelName(fileName) {

    const filename = _trimExtFromFileName(fileName).toLocaleLowerCase();
    return _.reduce(filename.split("_"), (str, fragment) => {
        return str + _.capitalize(fragment);
    }, "");
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

    for (let item of items) {

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
    }

    return container;
}