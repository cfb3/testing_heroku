//express is the framework we're going to use to handle requests
const express = require('express')

//Access the connection to Heroku Database
let pool = require('../utilities/utils').pool

var router = express.Router()

//This allows parsing of the body of POST requests, that are encoded in JSON
router.use(require("body-parser").json())

/**
 * @api {put} /auth Request to insert a Pushy Token for the user
 * @apiName PutAuth
 * @apiGroup Auth
 * 
 * @apiHeader {String} authorization Valid JSON Web Token JWT
 * @apiParam {String} token the Pushy Token of the user identified in the JWT
 * 
 * @apiSuccess {boolean} success true when the pushy token is inserted
 * 
 * @apiError (400: Missing Parameters) {String} message "Missing required information"
 * 
 * @apiError (404: User Not Found) {String} message "email not found"
 * 
 * @apiError (400: JSON Error) {String} message "malformed JSON in parameters"
 * 
 * @apiError (400: SQL Error) {String} message the reported SQL error details
 */ 
router.put('/', (request, response, next) => {
    //validate on missing parameters
    //don't need to check JWT, it was already checked via middleware.js
    if (!request.body.token) {
        response.status(400).send({
            message: "Missing required information"
        })
    }  else {
        next()
    }
}, (request, response, next) => {
    //the JWT middleware.js function decodes the JWT and stores the emil in an 
    //object called decoded. It adds this object to the request object. 
    let email = request.decoded.username

    //validate email exists AND convert it to the associated memberId
    let query = 'SELECT MemberID FROM Members WHERE Email=$1'
    let values = [email]

    pool.query(query, values)
        .then(result => {
            if (result.rowCount == 0) {
                //this should NOT happen. The email is coming from a 
                //JWT created by this service. But, keep the check here
                //anyway.
                response.status(404).send({
                    message: "email not found"
                })
            } else {
                //Convert the email to the memberid
                request.params.email = result.rows[0].memberid
                next()
            }
        }).catch(error => {
            response.status(400).send({
                message: "SQL Error",
                error: error
            })
        })
}, (request, response) => {

    console.log(request.body.token)

    //ON CONFLICT is a Postgressql syntax. it allows for an extra
    //action when conflicts occur with inserts. This will update 
    //an exisiting users token. 
    let insert = `INSERT INTO Push_Token(MemberId, Token)
                  VALUES ($1, $2)
                  ON CONFLICT (MemberId) DO UPDATE SET token=$2
                  RETURNING *`
    let values = [request.params.email, request.body.token]
    pool.query(insert, values)
        .then(result => {
            response.send({
                sucess: true
            })
        }).catch(err => {
            response.status(400).send({
                message: "SQL Error",
                error: err
            })
        })
})

module.exports = router