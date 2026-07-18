import { getPosCredentialsPublic, savePosCredentials, } from '../services/settings.service.js';
export async function settingsRoutes(app) {
    app.get('/api/settings/pos-credentials', async () => {
        return getPosCredentialsPublic();
    });
    app.put('/api/settings/pos-credentials', async (req, reply) => {
        const { database_name, username = 'sa', password } = req.body;
        try {
            const result = savePosCredentials({ database_name, username, password });
            return {
                ...result,
                message: 'POS SQL credentials saved. All registered POS machines updated.',
            };
        }
        catch (err) {
            return reply.status(400).send({
                error: err instanceof Error ? err.message : 'Failed to save credentials',
            });
        }
    });
}
