FROM node:20-slim

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile

COPY dist/ ./dist/
COPY conf/ ./conf/

RUN mkdir -p log data

EXPOSE 5001

CMD ["node", "dist/index.js"]
