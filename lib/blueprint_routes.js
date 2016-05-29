/**
 *
 * Created by uur on 18/11/14.
 */

module.exports = {
    "index": {
        method: "get",
        path: ""
    },
    "new": {
        method: "get",
        path: "/new"
    },
    "edit": {
        method: "get",
        path: "/{id}/edit"
    },
    "create": {
        method: "post",
        path: "/create"
    },
    "update": {
        method: "post",
        path: "/{id}/update"
    },
    "delete": {
        method: "post",
        path: "/{id}/delete"
    },
    "sorting": {
        method: "get",
        path: "/sorting"
    },
    "sorted": {
        method: "post",
        path: "/sorted"
    }
};