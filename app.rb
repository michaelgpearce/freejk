#!/usr/bin/env ruby

require 'sinatra'

# Enable CORS for all routes so your frontend can access it
before do
  response.headers['Access-Control-Allow-Origin'] = '*'
end


# Optionally, you can add a route to serve a default HTML file.
get '/' do
  send_file 'public/index.html'
end

