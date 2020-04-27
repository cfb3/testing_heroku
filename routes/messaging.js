//express is the framework we're going to use to handle requests
const express = require('express');

//Access the connection to Heroku Database
let pool = require('../utilities/utils').pool

var router = express.Router();
const bodyParser = require("body-parser");

//This allows parsing of the body of POST requests, that are encoded in JSON
router.use(bodyParser.json());

let msg_functions = require('../utilities/utils').messaging;

//send a message to all users "in" the chat session with chatId
router.post("/", (req, res) => {
    let email = req.body.email
    let message = req.body.message
    let chatId = req.body.chatId
    if(!email || !message || !chatId) {
        res.status(400).send({
            message: "Missing required information"
        })
        return
    }
    //add the message to the database
    let insert = `INSERT INTO Messages(ChatId, Message, MemberId)
                  SELECT $1, $2, MemberId FROM Members 
                  WHERE email=$3
                  RETURNING *`
    let values = [chatId, message, email]
    pool.query(insert, values)
        .then(result => {
            if (result.rowCount == 1) {
                res.send({
                    sucess: true
                })
            } else {
                res.status(400).send({
                    "message": "unknown email address"
                })
            }
        //send a notification of this message to ALL members with registered tokens
        // db.manyOrNone('SELECT * FROM Push_Token')
        // .then(rows => {
        //     rows.forEach(element => {
        //         msg_functions.sendToIndividual(element['token'], message, email);
        //     })
        //     res.send({
        //         success: true
        //     })
        // }).catch(err => {
        //     res.send({
        //         success: false,
        //         error: err,
        //     })
        // })
        }).catch(err => {
            if (err.constraint == "messages_chatid_fkey") {
                res.status(400).send({
                    message: "invalid chat id"
                })
            } else {
                res.status(400).send({
                    message: "SQL Error",
                    error: err
                })
            }
        })
})

/**
 * @api {get} /messages/:chatId?/:messageId? Request to get chat messages from the server
 * @apiName GetMessages
 * @apiGroup Messages
 * 
 * @apiParam {String} Optioal name the name to look up. If no name provided, all names are returned
 * @apiParam {String} Optional name the name to look up. If no name provided, all names are returned
 * 
 * @apiSuccess {boolean} success true when the name is inserted
 * @apiSuccess {Object[]} names List of names in the Demo DB
 * @apiSuccess {String} names.name The name
 * @apiSuccess {String} names.message The message asscociated with the name
 * 
 * @apiError (404: Name Not Found) {String} message "Name not found"

 * @apiError (400: SQL Error) {String} message the reported SQL error details
 * 
 * @apiUse JSONError
 */ 
router.get("/:chatId?/:messageId?", (request, response, next) => {
    
        if (!request.params.chatId) {
            response.status(400).send({
                message: "Missing required information"
            })
        } else {
            next()
        }
    }, (request, response, next) => {

        let query = 'SELECT * FROM CHATS WHERE ChatId=$1'
        let values = [request.params.chatId]

        pool.query(query, values)
            .then(result => {
                if (result.rowCount == 0) {
                    response.status(404).send({
                        message: "Chat ID not found"
                    })
                } else {
                    next()
                }
            }).catch(error => {
                response.status(400).send({
                    message: "SQL Error",
                    error: error
                })
            })
    }, (request, response) => {

        if (!request.params.messageId) {
            request.params.messageId = 2**31 - 1
        }

        let query = `SELECT Messages.PrimaryKey AS messageId, Members.Email, Messages.Message, 
                    to_char(Messages.Timestamp AT TIME ZONE 'PDT', 'YYYY-MM-DD HH24:MI:SS.US' ) AS Timestamp
                    FROM Messages
                    INNER JOIN Members ON Messages.MemberId=Members.MemberId
                    WHERE ChatId=$1 AND Messages.PrimaryKey < $2
                    ORDER BY Timestamp DESC
                    LIMIT 10`
        let values = [request.params.chatId, request.params.messageId]
        pool.query(query, values)
            .then(result => {
                // console.log("Result:")
                // console.log(result)
                response.send({
                    rowCount : result.rowCount,
                    rows: result.rows
                })
            }).catch(err => {
                // console.log("Error:")
                // console.log(err)
                response.status(400).send({
                    message: "SQL Error",
                    error: err
                })
            })
});
module.exports = router;
