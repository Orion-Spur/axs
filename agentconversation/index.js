module.exports = async function (context, req) {
    context.log('Agent conversation function processing request...');

    // Get user message from request body
    const userMessage = req.body && req.body.message;
    
    if (!userMessage) {
        context.res = {
            status: 400,
            body: "Please pass a message in the request body"
        };
        return;
    }

    try {
        // Import built-in https module
        const https = require('https');
        
        // Test outbound connectivity to httpbin.org using built-in https module
        context.log('Testing outbound connectivity to httpbin.org...');
        
        // Create a promise-based https request
        const httpsRequest = (url) => {
            return new Promise((resolve, reject) => {
                https.get(url, (res) => {
                    let data = '';
                    
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        resolve({
                            status: res.statusCode,
                            statusText: res.statusMessage,
                            data: data
                        });
                    });
                }).on('error', (err) => {
                    reject(err);
                });
            });
        };
        
        let connectivityTestResult = null;
        
        try {
            const httpbinResponse = await httpsRequest('https://httpbin.org/get');
            connectivityTestResult = {
                success: true,
                status: httpbinResponse.status,
                statusText: httpbinResponse.statusText
            };
            context.log(`Connectivity test successful: ${httpbinResponse.status}`);
        } catch (connectivityError) {
            connectivityTestResult = {
                success: false,
                error: connectivityError.message
            };
            context.log.error(`Connectivity test failed: ${connectivityError.message}`);
        }
        
        // Return response with connectivity test results
        context.res = {
            status: 200,
            body: {
                response: `You said: "${userMessage}". This is a test response from the AXS Passport AI Agent.`,
                createAdjustment: false,
                connectivityTest: connectivityTestResult
            }
        };
    } catch (error) {
        context.log.error(`Error: ${error.message}`);
        context.res = {
            status: 500,
            body: {
                error: "An error occurred while processing your request",
                details: error.message
            }
        };
    }
};
