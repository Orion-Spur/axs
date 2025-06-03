const { AzureKeyCredential, OpenAIClient } = require("@azure/openai");

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
        
        // Initialize the OpenAI client
        const client = new OpenAIClient(endpoint, new AzureKeyCredential(apiKey));
        
        // Extract system message from your ChatSetup.json
        const systemMessage = "You are the AXS Passport AI Agent, designed to help with workplace adjustments. You assist users in creating and managing adjustment records for employees with disabilities or health conditions.";
        
        // Log the conversation for debugging
        context.log(`User message: ${userMessage}`);
        
        // Call your AI Foundry agent
        context.log('Sending request to OpenAI API...');
        const response = await client.getChatCompletions(
            deploymentName,
            [
                { role: "system", content: systemMessage },
                { role: "user", content: userMessage }
            ],
            { 
                temperature: 0.7, 
                maxTokens: 800
            }
        );
        
        // Extract the response
        const agentResponse = response.choices[0].message.content;
        
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
        context.res = {
            status: 500,
            body: {
                error: "An error occurred while processing your request",
                details: error.message
            }
        };
    }
};
