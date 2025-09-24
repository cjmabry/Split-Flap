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
  const client = new shopify.clients.Rest({ session });
  try {
    const response = await client.get({
      path: `collections/${collectionId}/products`
    });
    return response.body.products;
  } catch (error) {
    console.error('Error fetching products by collection:', error);
    return [];
  }
}

// ========================================================================
// API

app.use('/api/workshops', async (req, res) => {
  let r = {
    data: []
  };

  const products = await getShopifyProductsByCollection(process.env.SHOPIFY_COLLECTION_ID);
  const activeProducts = products.filter(product => product.status === 'active');

  for (let i = 0; i < activeProducts.length; i++) {
    let product = activeProducts[i];
    let data = {
      date: product.created_at ? product.created_at.slice(5, 10).replace('-', '') : '',
      time: product.published_at ? product.published_at.slice(11, 16).replace(':', '') : '',
      class: product.title || ''
    };

    // Mark some as sold out
    data.status = (product.variants && product.variants[0] && product.variants[0].inventory_quantity > 0) ? 'A' : 'B';

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