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
        
        // Prepare the request to Azure OpenAI
        const url = `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=2023-05-15`;
        const headers = {
            'Content-Type': 'application/json',
            'api-key': apiKey
        };
        const data = {
            messages: [
                { role: "system", content: "You are the AXS Passport AI Agent, designed to help with workplace adjustments." },
                { role: "user", content: userMessage }
            ],
            temperature: 0.7
        };
        
        // Make the API call using axios
        const response = await axios.post(url, data, { headers });
        const agentResponse = response.data.choices[0].message.content;
        const createAdjustment = agentResponse.toLowerCase().includes("create adjustment");
        
        context.res = {
            status: 200,
            body: {
                response: agentResponse,
                createAdjustment: createAdjustment
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
