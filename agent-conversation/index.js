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
        
        // Try to call OpenAI API, but fall back to placeholder if it fails
        try {
            // Prepare the request to Azure OpenAI
            const url = `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=2023-05-15`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey
                },
                body: JSON.stringify({
                    messages: [
                        { role: "system", content: "You are the AXS Passport AI Agent, designed to help with workplace adjustments." },
                        { role: "user", content: userMessage }
                    ],
                    temperature: 0.7
                })
            });
            
            if (!response.ok) {
                throw new Error(`OpenAI API returned ${response.status}`);
            }
            
            const data = await response.json();
            const agentResponse = data.choices[0].message.content;
            const createAdjustment = agentResponse.toLowerCase().includes("create adjustment");
            
            context.res = {
                status: 200,
                body: {
                    response: agentResponse,
                    createAdjustment: createAdjustment
                }
            };
        } catch (apiError) {
            // Log the API error but still return a successful response with placeholder
            context.log.error(`OpenAI API error: ${apiError.message}`);
            context.res = {
                status: 200,
                body: {
                    response: `I received your message: "${userMessage}". This is a placeholder response while we troubleshoot the OpenAI integration.`,
                    createAdjustment: false,
                    error: apiError.message
                }
            };
        }
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
