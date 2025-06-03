const axios = require('axios');

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
        // Get OpenAI configuration from environment variables
        const apiKey = process.env.OPENAI_API_KEY;
        const endpoint = process.env.OPENAI_API_ENDPOINT;
        const deploymentName = process.env.OPENAI_DEPLOYMENT_NAME || "gpt-4o";
        
        if (!apiKey || !endpoint) {
            throw new Error("OpenAI API configuration is missing");
        }
        
        // Log configuration (without sensitive data)
        context.log(`Using OpenAI endpoint: ${endpoint}`);
        context.log(`Using deployment: ${deploymentName}`);
        
        // System message for the AI agent
        const systemMessage = "You are the AXS Passport AI Agent, designed to help with workplace adjustments. You assist users in creating and managing adjustment records for employees with disabilities or health conditions.";
        
        // Prepare the request to Azure OpenAI
        const url = `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=2023-05-15`;
        const headers = {
            'Content-Type': 'application/json',
            'api-key': apiKey
        };
        const data = {
            messages: [
                { role: "system", content: systemMessage },
                { role: "user", content: userMessage }
            ],
            temperature: 0.7
        };
        
        // Make the API call using axios instead of the SDK
        context.log('Sending request to OpenAI API...');
        const response = await axios.post(url, data, { headers });
        
        // Extract the response
        const agentResponse = response.data.choices[0].message.content;
        
        // Log the response for debugging
        context.log(`Agent response: ${agentResponse}`);
        
        // Check if the response indicates an adjustment record should be created
        const createAdjustment = agentResponse.toLowerCase().includes("create adjustment") || 
                                agentResponse.toLowerCase().includes("new adjustment");
        
        context.log(`Create adjustment flag: ${createAdjustment}`);
        
        context.res = {
            status: 200,
            body: {
                response: agentResponse,
                createAdjustment: createAdjustment
            }
        };
    } catch (error) {
        context.log.error(`Error processing message: ${error.message}`);
        if (error.response) {
            context.log.error(`Error response: ${JSON.stringify(error.response.data)}`);
        }
        context.res = {
            status: 500,
            body: {
                error: "An error occurred while processing your request",
                details: error.message
            }
        };
    }
};
