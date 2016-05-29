module.exports =  (blueprintName) => {
    if (blueprintName == "update" ||
        blueprintName == "create") {
        return {
            maxBytes: 20971520,
            output: "file",
            parse: true
        };
    }
    return null;
};