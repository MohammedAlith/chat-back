// server.js
import express from 'express';
import { createServer } from 'http';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { makeExecutableSchema } from '@graphql-tools/schema';
import bodyParser from 'body-parser';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
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
    sendMessage(user: String!, text: String!): Message!
    updateMessage(id: ID!, text: String!): Message!
    deleteMessage(id: ID!): ID!
  }

  type Subscription {
    messageSent: Message!
  }
`;

const messages = [];
const pubsub = new PubSub();
let nextId = 1;

const resolvers = {
  Query: {
    messages: () => messages,
  },
  Mutation: {
    sendMessage: (_, { user, text }) => {
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
    updateMessage: (_, { id, text }) => {
      const msg = messages.find(m => m.id === id);
      if (!msg) throw new Error("Message not found");
      msg.text = text;
      return msg; // only mutation, no subscription needed
    },
    deleteMessage: (_, { id }) => {
      const index = messages.findIndex(m => m.id === id);
      if (index === -1) throw new Error("Message not found");
      messages.splice(index, 1);
      return id;
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

// WebSocket for subscription (only new messages)
const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
useServer({ schema }, wsServer);

const server = new ApolloServer({ schema });
await server.start();
app.use('/graphql', cors(), bodyParser.json(), expressMiddleware(server));

httpServer.listen(4000, () => {
  console.log('Server running on http://localhost:4000/graphql');
  console.log('WebSocket URL for subscriptions: ws://localhost:4000/graphql');
});
