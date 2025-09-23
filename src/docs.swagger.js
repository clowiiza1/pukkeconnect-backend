import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: { title: 'PukkeConnect API', version: '1.0.0' },

    // Tell Swagger how we handle JWTs
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    },

    // Apply security globally (all endpoints unless overridden)
    security: [{ bearerAuth: [] }]
  },

  // Look for JSDoc comments in route files
  apis: ['src/modules/**/*.routes.js']
};

export const swaggerSpec = swaggerJsdoc(options);
export { swaggerUi };
