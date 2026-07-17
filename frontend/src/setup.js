// Vite bootstrap — must load before main.jsx
// Sets React/ReactDOM as globals for files using bare identifiers (app.jsx)
import React from 'react';
import ReactDOM from 'react-dom';

export { React, ReactDOM };
window.React = React;
window.ReactDOM = ReactDOM;
