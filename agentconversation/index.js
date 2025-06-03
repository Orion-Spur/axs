module.exports = async function (context, req) {
    context.log('Agent conversation function processing request...');
    
    try {
        const endpoint = "https://axs-passport-agent.services.ai.azure.com/api";
        const apiKey = process.env.AZURE_AI_API_KEY || process.env.OPENAI_API_KEY;
        
        // Simple connectivity test
        try {
            const response = await fetch(`${endpoint}/health`, {
                method: 'GET',
                headers: {
                    'api-key': apiKey
                }
            } );
            
            const status = response.status;
            const text = await response.text();
            
            context.res = {
                status: 200,
                body: {
                    message: "Connectivity test completed",
                    endpoint: endpoint,
                    statusCode: status,
                    responseText: text
                }
            };
        } catch (fetchError) {
            context.res = {
                status: 200,
                body: {
                    error: "Fetch error",
                    details: fetchError.message,
                    stack: fetchError.stack,
                    endpoint: endpoint
                }
            };
        }
    } catch (error) {
        context.res = {
            status: 500,
            body: {
                error: "Function error",
                details: error.message,
                stack: error.stack
            }
        };
    }
};
