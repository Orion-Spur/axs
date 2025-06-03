// Azure Function for agent-conversation
// This is a simplified version that focuses on reliability

const { DefaultAzureCredential } = require('@azure/identity');
const { OpenAIClient } = require('@azure/openai');

module.exports = async function (context, req) {
    context.log('Processing agent-conversation request');
    
    try {
        // Get messages from request body
        const messages = req.body?.messages;
        
        if (!messages || !Array.isArray(messages)) {
            context.log.error('Invalid request: messages array is required');
            return {
                status: 400,
                body: { error: "Invalid request: messages array is required" }
            };
        }
        
        // Azure OpenAI configuration
        const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
        const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT;
        const apiKey = process.env.AZURE_OPENAI_KEY;
        
        if (!endpoint || !deploymentName || !apiKey) {
            context.log.error('Missing Azure OpenAI configuration');
            return {
                status: 500,
                body: { error: "Server configuration error" }
            };
        }
        
        // Initialize OpenAI client with API key
        const client = new OpenAIClient(
            endpoint,
            { key: apiKey }
        );
        
        // Call Azure OpenAI
        const result = await client.getChatCompletions(
            deploymentName,
            messages,
            {
                temperature: 1.0,
                topP: 1.0,
                maxTokens: 1000
            }
        );
        
        if (!result || !result.choices || result.choices.length === 0) {
            context.log.error('Empty response from OpenAI API');
            return {
                status: 500,
                body: { error: "Failed to get response from AI service" }
            };
        }
        
        // Extract the response
        const response = result.choices[0].message.content;
        
        // Return successful response
        return {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: { response }
        };
        
    } catch (error) {
        // Log detailed error
        context.log.error(`Error in agent-conversation: ${error.message}`);
        context.log.error(error.stack);
        
        // Return error response
        return {
            status: 500,
            body: { 
                error: "Internal server error", 
                message: error.message,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            }
        };
    }
};
