# 🧩 PukkeConnect Backend

This repository contains the **backend system** for the **PukkeConnect** platform — a university-based digital ecosystem that facilitates communication, data management, and student engagement.  
The backend provides secure RESTful APIs for authentication, data storage, and interaction between users, representatives, and administrators.


## 🚀 Overview

The backend is built using **Node.js**, **Express.js**, and **PostgreSQL** via **Sequelize ORM**.  
It serves as the core data and logic layer for the PukkeConnect web system, supporting:

- 🔐 User authentication and authorization (JWT)
- 🎓 Student and representative management
- 🗃️ Database interactions via Sequelize ORM
- 💬 Announcement and communication APIs
- ⚙️ Configurable, environment-driven deployment

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-------------|
| Language | JavaScript (Node.js) |
| Framework | Express.js |
| Database | PostgreSQL |
| ORM | Sequelize |
| Authentication | JWT (JSON Web Token) |
| Environment | dotenv |
| Testing (optional) | Jest / Supertest |
| Deployment | Render |

---

## 📂 Directory Structure

```
backend/
│
├── src/
│   ├── config/          # Database and environment configuration
│   ├── controllers/     # Request handlers and business logic
│   ├── models/          # Sequelize models and associations
│   ├── routes/          # Route definitions
│   ├── middleware/      # Auth and validation middleware
│   ├── utils/           # Helper functions
│   └── app.js           # Main Express application
│
├── .env.example
├── package.json
├── README.md
└── server.js            # Entry point
```



## 🔗 API Endpoints

### 🔒 Authentication
| Method | Endpoint | Description |
|--------|-----------|-------------|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login and receive JWT |

### 👤 Users
| Method | Endpoint | Description |
|--------|-----------|-------------|
| GET | `/api/users` | Retrieve all users |
| GET | `/api/users/:id` | Retrieve a specific user |
| PUT | `/api/users/:id` | Update user details |
| DELETE | `/api/users/:id` | Delete a user account |

### 📢 Announcements
| Method | Endpoint | Description |
|--------|-----------|-------------|
| GET | `/api/announcements` | Fetch all announcements |
| POST | `/api/announcements` | Create a new announcement |
| DELETE | `/api/announcements/:id` | Delete an announcement |

---

## 🧪 Testing (Optional)

If you have tests configured:
```bash
npm test
```

---

## 🧰 Common Commands to run servers

| Command | Description |
|----------|-------------
| `npm start` | Run server in production |
| `npm run dev` | Run server in development (with nodemon) |
| `npx sequelize-cli db:migrate` | Apply database migrations |
| `npx sequelize-cli db:seed:all` | Seed database with demo data |



## 📦 Deployment

To deploy on **Render**:
1. Set environment variables on the hosting platform.
2. Connect your GitHub repository.
3. Deploy the service using `npm start` as the start command.
4. Ensure PostgreSQL is configured as an external service.

---


