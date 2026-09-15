const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'InternIQ API',
      version: '1.0.0',
      description: 'REST API documentation for the InternIQ Internship Management System backend.',
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 5000}/api`,
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Registration, login, password management' },
      { name: 'Students', description: 'Student profile and applications' },
      { name: 'Companies', description: 'Company profile management' },
      { name: 'Internships', description: 'Internship listings, search, filter' },
      { name: 'Applications', description: 'Student applications to internships' },
      { name: 'Supervisors', description: 'Supervisor profile, students, evaluations' },
      { name: 'Admin', description: 'Admin dashboard and user/company management' },
      { name: 'Notifications', description: 'In-app notifications' },
    ],
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
