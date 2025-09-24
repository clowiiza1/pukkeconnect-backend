import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: { title: 'PukkeConnect API', version: '1.0.0' },
    servers: [{ url: `http://localhost:4000` }],

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
apis: [
    'src/modules/**/*.routes.js',
   'src/modules/**/*.route.js',
   'src/modules/**/posts.*.js' // belt & braces for your posts file
  ]
  
};

export const swaggerSpec = swaggerJsdoc(options);
console.log('Swagger paths loaded:', Object.keys(swaggerSpec.paths || {}));

export { swaggerUi };
