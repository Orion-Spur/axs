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
        // Simple response without any external API calls
        context.res = {
            status: 200,
            body: {
                response: `You said: "${userMessage}". This is a test response from the AXS Passport AI Agent.`,
                createAdjustment: false
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
