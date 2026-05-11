# TicTacToe Backend Setup

## Database

Gunakan MySQL Laragon dengan konfigurasi default:
- `host`: localhost
- `port`: 3306
- `user`: root
- `password`: (kosong)
- `database`: tictactoe_realtime

Import file:
- `database.sql`

## Environment

Salin `.env.example` menjadi `.env` jika perlu.

Contoh `.env`:
```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=tictactoe_realtime
DB_PORT=3306

CLIENT_URL=http://localhost:5173
```

## Install

```bash
npm install
```

## Run

```bash
npm start
```

## API Auth

- `POST /api/register`
- `POST /api/login`

Gunakan JSON body:
```json
{
  "username": "user",
  "password": "secret"
}
```
