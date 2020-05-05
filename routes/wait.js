//express is the framework we're going to use to handle requests
const express = require('express')

//retrieve the router pobject from express
var router = express.Router()

/**
 * @api {get} /wait Request a long running task
 * @apiName GetWait
 * @apiGroup Wait
 *
 * @apiSuccess {String} message Hello World message after a long wait
 */
router.get("/", (request, response) => {
    setTimeout(() => {
        response.send({
            message: "Thanks for waiting"
        });
    }, 5000)
})

// "return" the router
module.exports = router