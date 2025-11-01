/* global require console process Promise module */

const express = require('express');
const { shopifyApi, ApiVersion } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');
require('dotenv').config();
const app = express();


const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  apiVersion: ApiVersion.July25,
  isEmbeddedApp: false,
  scopes: ['read_products'],
  hostName: process.env.SHOPIFY_SHOP.replace(/^https?:\/\//, ''),
});

async function getShopifyProductsByCollection(collectionId) {
  const session = {
    shop: process.env.SHOPIFY_SHOP,
    accessToken: process.env.SHOPIFY_API_ACCESS_TOKEN
  };
  const client = new shopify.clients.Graphql({
    session,
    apiVersion: ApiVersion.July25,
  });

  const response = await client.request(
    `{
      collection(id: "gid://shopify/Collection/${process.env.SHOPIFY_COLLECTION_ID}") {
        products(first: 100) {
          edges {
            node {
              id
              title
              descriptionHtml
              status
              variants(first: 1) {
                edges {
                  node {
                    inventoryQuantity
                  }
                }
              }
              metafields(first: 3, namespace: "custom") {
                edges {
                  node {
                    namespace
                    key
                    value
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }`,
  );

  return response.data.collection.products.edges.map(edge => edge.node);
}

// ========================================================================
// API

app.use('/api/workshops', async (req, res) => {
  let r = {
    data: []
  };

  const products = await getShopifyProductsByCollection(process.env.SHOPIFY_COLLECTION_ID);

  for (const product of products) {
    // skip anything in draft stage
    if (product.status !== 'ACTIVE') {
      continue;
    }

    // start building data object
    let data = {
      id: product.id,
      class: product.title
    };

    // Populate date and time from product metafields
    if (product.metafields && product.metafields.edges) {
      product.metafields.edges.forEach(({ node }) => {
      try {
        if (node.key !== 'date_and_time') {
        return;
        }
        const values = JSON.parse(node.value);
        if (Array.isArray(values)) {
        values.forEach(val => {
          const utcDate = new Date(val); // val is "2025-05-02T23:00:00Z"
          
          // Convert to Central Time
          const centralDate = new Date(utcDate.toLocaleString('en-US', { timeZone: 'America/Chicago' }));

          const month = String(centralDate.getMonth() + 1).padStart(2, '0');
          data.month = month;
          data.year = String(centralDate.getFullYear());
          
          const day = String(centralDate.getDate()).padStart(2, '0');
          const dateStr = `${day}`;

          let hours = centralDate.getHours();
          const minutes = String(centralDate.getMinutes()).padStart(2, '0');
          const ampm = hours >= 12 ? 'pm' : 'am';
          hours = hours % 12;
          hours = hours === 0 ? 12 : hours;
          const hoursStr = String(hours).padStart(2, '0'); // Add leading zero

          data.date = `${month}${dateStr}`;
          const timeStr = `${hoursStr}${minutes}${ampm}`; // removed colon
          data.time = timeStr;
          // Add full datetime in ISO format for sorting
          data.fullDateTime = centralDate.toISOString();
        });
        }
      } catch (e) {
        console.error('Error parsing metafield value:', e);
      }
      });
    }

    // Mark as sold out based on inventory quantity of first variant
    if (
      product.variants &&
      product.variants.edges &&
      product.variants.edges[0] &&
      product.variants.edges[0].node &&
      typeof product.variants.edges[0].node.inventoryQuantity !== 'undefined'
    ) {
      data.status = product.variants.edges[0].node.inventoryQuantity > 0 ? 'A' : 'B';
    }

    if (data.date && data.year) {
      // Parse date from data.date (MMDD format) and data.year
      const year = parseInt(data.year, 10);
      const month = parseInt(data.date.slice(0, 2), 10) - 1; // JS months are 0-based
      const day = parseInt(data.date.slice(2, 4), 10);
      const productDate = new Date(Date.UTC(year, month, day));

      const today = new Date();
      const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

      if (productDate < todayUTC) {
      continue; // Skip this product if date is before today
      }
    }

    r.data.push(data);
  }

  res.json(r);
});

// ========================================================================
// STATIC FILES
app.use('/', express.static('public'));

// ========================================================================
// WEB SERVER
const port = process.env.PORT || 8080;
app.listen(port);
console.log('split flap started on port ' + port);