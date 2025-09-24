sf.plugins.workshops = {
  dataType: 'json',

  url: function(options) {
    return 'api/workshops';
  },

  formatData: function(response) {
    return response.data;
  }
};
