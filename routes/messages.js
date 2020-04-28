//express is the framework we're going to use to handle requests
const express = require('express');

//Access the connection to Heroku Database
let pool = require('../utilities/utils').pool

var router = express.Router();
const bodyParser = require("body-parser");

//This allows parsing of the body of POST requests, that are encoded in JSON
router.use(bodyParser.json());

let msg_functions = require('../utilities/utils').messaging;

/**
 * @apiDefine JSONError
 * @apiError (400: JSON Error) {String} message "malformed JSON in parameters"
 */ 

/**
 * @api {post} /messages Request to add a message to a specific chat
 * @apiName PostMessages
 * @apiGroup Messages
 * 
 * @apiParam {Number} chatId the id of th chat to insert this message into
 * @apiParam {String} email the email of the user inserting the message
 * @apiParam {String} message a message to store 
 * 
 * @apiSuccess (Success 201) {boolean} success true when the name is inserted
 * @apiSuccess (Success 201) {String} message the inserted name
 * 
 * @apiError (400: Unknown user) {String} message "unknown email address"
 * 
 * @apiError (400: Missing Parameters) {String} message "Missing required information"
 * 
 * @apiError (400: SQL Error) {String} message the reported SQL error details
 * 
 * @apiError (400: Unknow Chat ID) {String} message "invalid chat id"
 * 
 * @apiUse JSONError
 */ 
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
 * @api {get} /messages/:chatId?/:messageId? Request to get chat messages 
 * @apiName GetMessages
 * @apiGroup Messages
 * 
 * @apiDescription Request to get the 10 most recent chat messages
 * from the server in a given chat - chatId. If an optional messageId is provided,
 * return the 10 messages in the chat prior to (and not including) the message containing
 * MessageID.
 * 
 * @apiParam {Number} chatId the chat to look up. 
 * @apiParam {Number} messageId (Optional) return the 10 messages prior to this message
 * 
 * @apiSuccess {Number} rowCount the number of messages returned
 * @apiSuccess {Object[]} messages List of massages in the message table
 * @apiSuccess {String} messages.messageId The id for this message
 * @apiSuccess {String} messages.email The email of the user who poseted this message
 * @apiSuccess {String} messages.message The message text
 * @apiSuccess {String} messages.timestamp The timestamp of when this message was posted
 * 
 * @apiError (404: ChatId Not Found) {String} message "Chat ID Not Found"
 * 
 * @apiError (400: Missing Parameters) {String} message "Missing required information"
 * 
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
                response.send({
                    rowCount : result.rowCount,
                    rows: result.rows
                })
            }).catch(err => {
                response.status(400).send({
                    message: "SQL Error",
                    error: err
                })
            })
});

module.exports = router;