//express is the framework we're going to use to handle requests
const express = require('express')

var router = express.Router()

const bodyParser = require("body-parser")
//This allows parsing of the body of POST requests, that are encoded in JSON
router.use(bodyParser.json())

// // Obtain a Pool of DB connections. 
// const { Pool } = require('pg')
// const pool = new Pool({
//     connectionString: process.env.DATABASE_URL,
//     ssl: {
//         rejectUnauthorized: false,
//     }
// })

let pool = require('../utilities/utils').pool


/**
 * @api {post} /demosql Request to add someone's name to the DB
 * @apiName PostDemoSql
 * @apiGroup DemoSql
 * 
 * @apiParam {String} name someone's name
 * 
 * @apiSuccess {boolean} success true when the name is inserted
 * @apiSuccess {String} msg the inserted name
 * 
 * @apiError (400: Missing Parameters) {String} error "Missing required information"
 * 
 * @apiError (400: SQL Error) {String} error the reported SQL error details
 */ 
router.post("/", (request, response) => {

    if (request.body.name) {
        const theQuery = "INSERT INTO DEMO(Text) VALUES ($1) RETURNING *"
        const values = [request.body.name]

        pool.query(theQuery, values)
            .then(result => {
                response.send({
                    success: true,
                    msg: result.rows[0].text
                })
            })
            .catch(err => {
                //log the error
                // console.log(err.details)
                response.status(400).send({
                    error: err.detail
                })
            }) 
    } else {
        response.status(400).send({
            error: "Missing required information"
        })
    }    
})

/**
 * @api {get} /demosql Request to get all demo entries in the DB
 * @apiName GetDemoSql
 * @apiGroup DemoSql
 * 
 * @apiSuccess {boolean} success true when the name is inserted
 * @apiSuccess {String[]} names lit of names in the Demo DB
 * 
 * @apiError (400: SQL Error) {String} error the reported SQL error details
 */ 
router.get("/", (request, response) => {

    pool.query('SELECT demoid, Text FROM Demo')
        .then(result => 
            response.send({
                success: true,
                names: result.rows
        }))
        .catch(err => {
            //log the error
            // console.log(err.details)
            response.status(400).send({
                error: err.detail
            })
        })
})

module.exports = router