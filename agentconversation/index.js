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
        // Use the full deployment name including version
        const deploymentName = process.env.OPENAI_DEPLOYMENT_NAME || "gpt-4o (version:2024-11-20)";
        
        if (!apiKey || !endpoint) {
            throw new Error("OpenAI API configuration is missing");
        }
        
        context.log(`Using endpoint: ${endpoint}`);
        context.log(`Using deployment: ${deploymentName}`);
        
        // Try to call OpenAI API, but fall back to placeholder if it fails
        try {
            // Extract the base deployment name without version for the URL path
            const baseDeploymentName = deploymentName.split(" ")[0];
            // Prepare the request to Azure OpenAI with updated API version
            const url = `${endpoint}/openai/deployments/${baseDeploymentName}/chat/completions?api-version=2023-12-01-preview`;
            context.log(`Calling URL: ${url}`);
            
            const requestBody = {
                messages: [
                    { role: "system", content: "You are the AXS Passport AI Agent, designed to help with workplace adjustments." },
                    { role: "user", content: userMessage }
                ],
                temperature: 0.7,
                model: deploymentName  // Use full deployment name in the request body
            };
            
            context.log(`Request body: ${JSON.stringify(requestBody)}`);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey,
                    'x-ms-model-mesh-model-name': deploymentName  // Use full deployment name in header
                },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenAI API returned ${response.status}: ${errorText}`);
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
                    error: apiError.message,
                    config: {
                        endpoint: endpoint,
                        deploymentName: deploymentName
                    }
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
