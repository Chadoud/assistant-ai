FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY *.js ./

ENV PORT=4011
EXPOSE 4011

CMD ["npm", "start"]
