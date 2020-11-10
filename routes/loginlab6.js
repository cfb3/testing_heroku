//express is the framework we're going to use to handle requests
const express = require('express')

//Access the connection to Heroku Database
let pool = require('../utilities').pool

let getHash = require('../utilities').getHash

var router = express.Router()

const bodyParser = require("body-parser")
//This allows parsing of the body of POST requests, that are encoded in JSON
router.use(bodyParser.json())

//Pull in the JWT module along with out asecret key
let jwt = require('jsonwebtoken')
let config = {
    secret: process.env.JSON_WEB_TOKEN
}


const {RateLimiterRedis} = require('rate-limiter-flexible')

const redisClient = require('redis').createClient(process.env.REDIS_URL)

//How may daily incorrect attepts do we allow from a single IP address?
const maxWrongAttemptsByIPperDay = 100

//How may daily incorrect attepts do we allow from a single IP address using the SAME username?
const maxConsecutiveFailsByUsernameAndIP = 3

//Create a Rate-Limiter Object representing multiple sign in attemps
//from the same IP reguardless of username
const limiterSlowBruteByIP = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'login_fail_ip_per_day',
  points: maxWrongAttemptsByIPperDay,
  duration: 60 * 60 * 24,
  blockDuration: 60 * 60 * 24, // Block for 1 day, if 100 wrong attempts per day
})

//Create a Rate-Limiter Object representing multiple sign in attemps
//from the same IP given the SAME username
const limiterConsecutiveFailsByUsernameAndIP = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'login_fail_consecutive_username_and_ip',
  points: maxConsecutiveFailsByUsernameAndIP,
  duration: 60 * 60 * 24 * 90, // Store number for 90 days since first fail
  blockDuration: 60 * 60, // Block for 1 hour
})

const getUsernameIPkey = (username, ip) => `${username}_${ip}`

//This function handles checking email credentials against what is stored in the DB.
//It returns an object that includes fields:
// email - the users email address
// exists - True the email exists in the DB, False email is not in the DB
// isSignedIn - True when the email/password credentials match False when they don't but the email exists
// err - (optional) there was some error
//This function is async and will execute...Asynchoronously. Client code can find the results using 
//then and catch when the function is called. Example in signInRoute
async function authorize(email, password) {
    let user = {
        email: email,
        exists:false,
        isSignedIn:false
    }
    let theQuery = "SELECT Password, Salt, MemberId FROM Members WHERE Email=$1"
    let values = [email]
    await pool.query(theQuery, values)
        .then(result => { 
            // console.log(result)
            if (result.rowCount == 1) {
                user.exists = true
                let salt = result.rows[0].salt
                //Retrieve our copy of the password
                let ourSaltedHash = result.rows[0].password 

                //Combined their password with our salt, then hash
                let theirSaltedHash = getHash(password, salt)

                //Did our salted hash match their salted hash?
                if (ourSaltedHash === theirSaltedHash ) {
                    user.isSignedIn = true
                    //credentials match. get a new JWT
                    user.jwt = jwt.sign(
                        {
                            "email": email,
                            memberid: result.rows[0].memberid
                        },
                        config.secret,
                        { 
                            expiresIn: '14 days' // expires in 14 days
                        }
                    )
                }
            } 
        })
        .catch((err) => {
            //log the error
            // console.log(err)
            // console.log(err.stack)
            user.err = err
        })
    return user
}


//Middleware function used to grab the Username/Password credentials from the HTTP Request header
function parseCredentials(request, response, next) {
    if (!request.headers.authorization || request.headers.authorization.indexOf('Basic ') === -1) {
        return response.status(401).json({ message: 'Missing Authorization Header' })
    } else {
        // obtain auth credentials from HTTP Header
        const base64Credentials =  request.headers.authorization.split(' ')[1]
        const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii')
        const [email, password] = credentials.split(':')
        request.email = email
        request.password = password
        next()
    }
}

// This function handles  steps for sign in to include:
// Check for brute force attacks/multiple sign-in attempts with incorrect password
// 
async function signInRoute(request, response) {
    const ipAddr = request.ip
    const usernameIPkey = getUsernameIPkey(request.email, ipAddr)

    //await causes this Asynchronous promiss block and happen Synchrounously. 
    const [resUsernameAndIP, resSlowByIP] = await Promise.all([
        limiterConsecutiveFailsByUsernameAndIP.get(usernameIPkey),
        limiterSlowBruteByIP.get(ipAddr),
      ]);

    let retrySecs = 0

    // Check if IP or Username + IP is already blocked
    if (resSlowByIP !== null && resSlowByIP.consumedPoints > maxWrongAttemptsByIPperDay) {
        retrySecs = Math.round(resSlowByIP.msBeforeNext / 1000) || 1
    } else if (resUsernameAndIP !== null && resUsernameAndIP.consumedPoints > maxConsecutiveFailsByUsernameAndIP) {
        retrySecs = Math.round(resUsernameAndIP.msBeforeNext / 1000) || 1
    }  

    if (retrySecs > 0) {
        //IP and or Username IS Blocked!
        response.set('Retry-After', String(retrySecs))
        response.status(429).send('Too Many Requests')
    } else {
        authorize(request.email, request.password)
            .then (async user => {
                if (user.err) {
                    response.status(400).send({ error:user.err })
                } else if (!user.isSignedIn) {
                    // Consume 1 point from limiters on wrong attempt and block if limits reached
                    try {
                        const promises = [limiterSlowBruteByIP.consume(ipAddr)]
                        if (user.exists) {
                            // Count failed attempts by Username + IP only for registered users
                            promises.push(limiterConsecutiveFailsByUsernameAndIP.consume(usernameIPkey))
                        }

                        await Promise.all(promises)

                        response.status(400).send({ message:'Credentials did not match'})
                    } catch (rlRejected) {
                        if (rlRejected instanceof Error) {
                            throw rlRejected;
                        } else {
                            response.set('Retry-After', String(Math.round(rlRejected.msBeforeNext / 1000)) || 1)
                            response.status(429).send({ message:'Too Many Requests'})
                        }
                    }
                } else {
                    if (resUsernameAndIP !== null && resUsernameAndIP.consumedPoints > 0) {
                        // Reset on successful authorisation
                        await limiterConsecutiveFailsByUsernameAndIP.delete(usernameIPkey);
                    }
                    response.send({
                        success:true,
                        message:"Authentication successful!",
                        token:user.jwt
                    })
                }
            })
            .catch(err => {
                console.log(err)
                response.status(500).end()
            })
        
    }
}


/**
 * @api {get} /auth Request to sign a user in the system
 * @apiName GetAuth
 * @apiGroup Auth
 * 
 * @apiHeader {String} authorization "username:password" uses Basic Auth 
 * 
 * @apiSuccess {boolean} success true when the name is found and password matches
 * @apiSuccess {String} message Authentication successful!
 * @apiSuccess {String} token JSON Web Token
 * 
 * @apiError (400: Missing Parameters) {String} message "Missing required information"
 * 
 * @apiError (404: User Not Found) {String} message "User not found"
 * 
 * @apiError (400: Invalid Credentials) {String} message "Credentials did not match"
 * 
 * @apiError (400: SQL Error) {String} message the reported SQL error details
 */ 
router.get('/', parseCredentials, async (request, response) => {
    try {
        await signInRoute(request, response);
    } catch (err) {
        console.log(err)
        response.status(500).end();
    }
})

module.exports = router