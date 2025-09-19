// server.js
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { makeExecutableSchema } from '@graphql-tools/schema';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import cors from 'cors';
import bodyParser from 'body-parser';
import { PubSub } from 'graphql-subscriptions';

const typeDefs = `
  type Message {
    id: ID!
    text: String!
    user: String!
    createdAt: String!
  }

  type Query {
    messages: [Message!]!
  }

  type Mutation {
    sendMessage(text: String!, user: String!): Message!
  }

  type Subscription {
    messageSent: Message!
  }
`;

const messages = []; // in-memory DB
const pubsub = new PubSub();

let nextId = 1; // incremental ID

const resolvers = {
  Query: {
    messages: () => messages,
  },
  Mutation: {
    sendMessage: (_, { text, user }) => {
      const message = {
        id: String(nextId++),
        text,
        user,
        createdAt: new Date().toISOString(),
      };
      messages.push(message);
      pubsub.publish('MESSAGE_SENT', { messageSent: message });
      return message;
    },
  },
  Subscription: {
    messageSent: {
      subscribe: () => pubsub.asyncIterator(['MESSAGE_SENT']),
    },
  },
};

const schema = makeExecutableSchema({ typeDefs, resolvers });
const app = express();
const httpServer = createServer(app);

const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
useServer({ schema }, wsServer);

const server = new ApolloServer({ schema });
await server.start();
app.use('/graphql', cors(), bodyParser.json(), expressMiddleware(server));

httpServer.listen(4000, () => {
  console.log('Server running on http://localhost:4000/graphql');
});
