/// <reference types="cypress" />

import { handleResponse } from './constants';

Cypress.Commands.add('getByTestId', (testId) => {
  return cy.get(`[data-testid="${testId}"]`);
});

Cypress.Commands.add('connectWallet', () => {
  cy.get('[data-testid="connect-wallet-button"]').click();
  cy.get('[data-testid="wallet-option-mock"]').click();
});

Cypress.Commands.add('interceptAllRequests', () => {
  cy.intercept('GET', 'https://api.g.alchemy.com/**', {
    statusCode: 200,
    body: {
      data: [
        {
          symbol: 'ETH',
          prices: [
            {
              currency: 'usd',
              value: '3315.4648569335',
              lastUpdatedAt: '2025-01-21T17:04:19Z',
            },
          ],
        },
      ],
    },
  });
  cy.intercept('GET', '**/public/pool-info', {
    statusCode: 200,
    fixture: 'asp/pool.json',
  });
  cy.intercept('GET', '**/public/mt-roots', {
    statusCode: 200,
    fixture: 'asp/mt-roots.json',
  });
  cy.intercept('GET', '**/public/mt-leaves', {
    statusCode: 200,
    fixture: 'asp/mt-leaves.json',
  });
  cy.intercept('GET', '**/public/deposits**', {
    statusCode: 200,
    fixture: 'asp/deposits.json',
  });
  cy.intercept('GET', '**/public/deposits-by-label', {
    statusCode: 200,
    fixture: 'asp/deposits.json',
  });
  cy.intercept('GET', '**/public/events**', {
    statusCode: 200,
    fixture: 'asp/events.json',
  });
  cy.intercept('GET', '**/fees', {
    statusCode: 200,
    fixture: 'relay/fees.json',
  });
  cy.intercept('GET', '**/relay', {
    statusCode: 200,
    fixture: 'relay/relay.json',
  });
  cy.intercept('GET', '/api/**', {
    statusCode: 200,
    body: {},
  });
  cy.fixture('rpcUrls').then((rpcUrls: string[]) => {
    rpcUrls.map((rpcUrl) => {
      cy.intercept('POST', rpcUrl, (res) => handleResponse(res));
    });
  });
});
