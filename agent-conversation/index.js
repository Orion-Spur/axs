module.exports = async function (context, req) {
    context.log('Agent conversation function processed a request.');

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
        // Get OpenAI configuration from environment variables
        const apiKey = process.env.OPENAI_API_KEY;
        const endpoint = process.env.OPENAI_API_ENDPOINT;
        const deploymentName = process.env.OPENAI_DEPLOYMENT_NAME || "gpt-4";
        
        // Log configuration for debugging
        context.log(`API Key exists: ${!!apiKey}`);
        context.log(`Endpoint: ${endpoint}`);
        context.log(`Deployment: ${deploymentName}`);
        
        // For now, return a simple response without calling OpenAI
        context.res = {
            status: 200,
            body: {
                response: `I received your message: "${userMessage}". This is a placeholder response while we debug the OpenAI integration.`,
                createAdjustment: false,
                debug: {
                    hasApiKey: !!apiKey,
                    endpoint: endpoint,
                    deploymentName: deploymentName
                }
            }
        };
    } catch (error) {
        context.log.error(`Error processing message: ${error.message}`);
        context.res = {
            status: 500,
            body: {
                error: "An error occurred while processing your request",
                details: error.message
            }
        };
    }
};
