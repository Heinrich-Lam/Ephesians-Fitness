const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const OAuth2 = google.auth.OAuth2;
const validator = require('validator');
const path = require('path');
const fs = require('fs');
const Papa = require('papaparse');
const config = require('./config');

const googleClientId = config.googleClientId;
const googleClientSecret = config.googleClientSecret;
const googleRefreshToken = config.googleRefreshToken;
const googleUser = config.googleUser;

const accountName = config.accountName;
const bankName = config.bankName;
const accountNumber = config.accountNumber;
const branchCode = config.branchCode;

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Google OAuth2 setup
const oauth2Client = new OAuth2(
  googleClientId, // Google Cloud Client ID
  googleClientSecret, // Google Cloud Client Secret
  'https://developers.google.com/oauthplayground' // Redirect URI
);

oauth2Client.setCredentials({
  refresh_token: googleRefreshToken
});

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    type: 'OAuth2',
    user: googleUser, // Your email
    clientId: googleClientId,
    clientSecret: googleClientSecret,
    refreshToken: googleRefreshToken,
    accessToken: oauth2Client.getAccessToken()
  }
});

// Function to send email
const sendEmail = (mailOptions, res) => {
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
      return res.status(500).send({ message: 'Failed to send email. Please try again later.' });
    }
    console.log('Email sent:', info.response);
    res.status(200).send({ message: 'Email sent successfully!' });
  });
};

//#region "Contact Us Form Email."
// Endpoint to handle contact us form submissions
app.post('/send-email', (req, res) => {
  const { name, email, phone = 'Not provided', subject, message } = req.body;

  // Validate email format using validator library
  if (!validator.isEmail(email)) {
    return res.status(400).send({ message: 'Invalid email format. Please provide a valid email address.' });
  }

  const mailOptions = {
    from: email,
    to: googleUser, // Your email
    subject: `Contact Us Form - ${subject || 'No Subject'}`,
    text: `Message from ${name} (${phone}): ${message}`,
    html: `
      <h3>New Contact Us Message</h3>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Message:</strong> ${message}</p>
    `
  };

  // Send the email
  sendEmail(mailOptions, res);
});
//#endregion

//#region "Personal Workout Request Email."
//Note: This sends an email to the Company as well as the Client.

// Endpoint to handle workout requests
app.post('/request-workout', (req, res) => {
  const { name, email, goals } = req.body;

  const mailOptions = {
    from: email,
    to: googleUser, // Your email
    subject: `Workout Request from ${name}`,
    text: `Workout request from ${name} (${email}): ${goals}`,
    html: `
      <h3>New Workout Request</h3>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Goals:</strong> ${goals}</p>
    `
  };

  // Send the email
  sendEmail(mailOptions, res);
});
//#endregion.

//#region "Order Details Email."
// Endpoint to handle sending payment-related emails
app.post('/send-payment-email', (req, res) => {
  const { orderid, name, email, address, city, state, zip, shippingFee, totalAmount, cartItems } = req.body;

  // Calculate total amount
  //let totalAmount = 0; // Initialize total amount
  let cartSummaryText = 'Shopping Cart Summary:\n';
  let cartSummaryHtml = '<h3>Shopping Cart Summary</h3><ul>';

  cartItems.forEach(item => {
    const totalPrice = item.price * item.quantity; // Calculate total price for the item
    //totalAmount += totalPrice; // Add to the overall total amount
    cartSummaryText += `Product: ${item.name}, Size: ${item.size}, Color: ${item.color}, Type: ${item.type}, Quantity: ${item.quantity}, Price: R${item.price}, Total: R${totalPrice}\n`;
    cartSummaryHtml += `
      <li>
        <strong>Product:</strong> ${item.name}<br>
        <strong>Size:</strong> ${item.size}<br>
        <strong>Color:</strong> ${item.color}<br>
        <strong>Type:</strong> ${item.type || "Standard"}<br>
        <strong>Quantity:</strong> ${item.quantity}<br>
        <strong>Price:</strong> R${item.price}<br>
        <strong>Sub Total:</strong> R${totalPrice}
      </li>
      <br>
    `;
  });

  cartSummaryHtml += '</ul>'; // Close the unordered list

  const mailOptions = {
    from: email, // Sender's email
    to: googleUser, // Your email
    subject: `Order Information from ${name}`,
    text: `
      Payment information from ${name} (${email}): 
      Address: ${address}, ${city}, ${state}, ${zip}\n
      Order Number: ${orderid}\n
      ${cartSummaryText}
      Shipping Fee: R${shippingFee}
      Total Amount: R${totalAmount}
    `,
    html: `
      <h3>New Payment Information</h3>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Address:</strong> ${address}, ${city}, ${state}, ${zip}</p>
      <p><strong>Order Number:</strong> ${orderid}</p>
      ${cartSummaryHtml}
      <p><strong>Shipping Fee:</strong> R${shippingFee}</p>
      <p><strong>Total Amount:</strong> R${totalAmount}</p>
    `
  };

  // Mail options to send back to the client with banking details
  const clientMailOptions = {
    from: googleUser,
    to: email,
    subject: `Order Confirmation - Payment Details for ${name}`,
    text: `
      Dear ${name},

      Thank you for your order! Please review your order details below and proceed with payment using the provided banking information.

      Order Number: ${orderid}
      ${cartSummaryText}
      Shipping Fee: R${shippingFee}
      Total Amount Due: R${totalAmount}

      Banking Details:
      Account Name: Ephesians Fitness
      Bank: [Your Bank Name]
      Account Number: [Your Account Number]
      Branch Code: [Your Branch Code]
      Reference: ${orderid}

      Please confirm payment within 48 hours to process your order.

      Regards,
      Ephesians Fitness
    `,
    html: `
      <h3>Order Confirmation</h3>
      <p>Dear ${name},</p>
      <p>Thank you for your order! Please review your order details below and proceed with payment using the provided banking information.</p>
      <p>Once payment is recieved, your order will be processed and shipped, please allow for 7 to 14 days for the arrival of your order.</p>

      <p><strong>Order Number:</strong> ${orderid}</p>
      ${cartSummaryHtml}
      <p><strong>Shipping Fee:</strong> R${shippingFee}</p>
      <p><strong>Total Amount Due:</strong> R${totalAmount}</p>

      <h4>Banking Details:</h4>
      <p><strong>Account Name:</strong> ${accountName}</p>
      <p><strong>Bank:</strong> ${bankName}</p>
      <p><strong>Account Number:</strong> ${accountNumber}</p>
      <p><strong>Branch Code:</strong> ${branchCode}</p>
      <p><strong>Reference:</strong> ${orderid}</p>

      <p>Please confirm payment within 48 hours to process your order.</p>
      <p>Regards,<br>Ephesians Fitness</p>
    `
  };

  // Send email to your business email
  sendEmail(mailOptions, res);

  // Send email to client
  sendEmail(clientMailOptions, res);
});
//#endregion

//#region "Review Email."
// Endpoint to handle sending review-related emails
app.post('/send-review-email', (req, res) => {
  const { name, email, comment, rating, cartid } = req.body;

  const mailOptions = {
    from: email, // Sender's email
    to: googleUser, // Your email
    subject: `New Review from ${name}`,
    text: `
      Review from ${name} (${email}):
      Rating: ${rating}/5
      Cart ID: ${cartid}
      Comment: ${comment}
    `,
    html: `
      <h3>New Review Received</h3>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Rating:</strong> ${rating}/5</p>
      <p><strong>Cart ID:</strong> ${cartid}</p>
      <p><strong>Comment:</strong> ${comment}</p>
    `
  };

  // Send the email
  sendEmail(mailOptions, res);
});
//#endregion.

//#region "Shippment Confermation Email."
app.post('/send-shipment-email', (req, res) => {
  const { orderid, orderdate, totalAmount, email } = req.body;

  const mailOptions = {
    from: googleUser, // Sender's email
    to: email,
    subject: `Order Out for delivery: ${orderid}`,
    text: `
      Order Number: ${orderid}
      Order Date: ${orderdate}
      Total Amount: ${totalAmount}
    `,
    html: `
      <h3>Order Out for Shipment</h3>
      <p><strong>Order Number:</strong> ${orderid}</p>
      <p><strong>Order Date:</strong> ${orderdate}</p>
      <p><strong>Total Amount:</strong> ${totalAmount}</p>
    `
  };

  // Send the email
  sendEmail(mailOptions, res);
});
//#endregion.

//#region "CSV File manepulation."
// Endpoint to update the CartID CSV file
app.post('/update-cart-id', (req, res) => {
  const newCartID = req.body.cartData.CART_ID; // Get the new CART_ID from the request body
  const filePath = path.join(__dirname, '../src/assets/files/CartID.csv'); // Path to your CSV file

  // Read the current CSV file
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading CSV file:', err);
      return res.status(500).send({ message: 'Error reading CSV file' });
    }

    // Parse the existing CSV data using PapaParse
    const parsedData = Papa.parse(data, { header: true, skipEmptyLines: true }).data;

    // Check if the new CartID already exists
    const existingItem = parsedData.find((item) => item.CART_ID === newCartID);

    if (existingItem) {
      return res.status(400).send({ message: 'Cart ID already exists in the file' });
    }

    // If the CartID doesn't exist, append it to the CSV content
    const newCsvRow = `${newCartID}\n`; // Format the new row for CSV
    const updatedCsvData = data.trim() + `\n${newCartID}`; // Append the new row to the existing CSV data

    // Write the updated CSV data back to the file
    fs.writeFile(filePath, updatedCsvData, 'utf8', (err) => {
      if (err) {
        console.error('Error writing to CSV file:', err);
        return res.status(500).send({ message: 'Error updating CSV file' });
      }

      res.status(200).send({ message: 'CSV file updated successfully' });
    });
  });
});

app.post('/update-order-id', (req, res) => {
  const newOrderID = req.body.orderData.ORDER_ID; // Get the new CART_ID from the request body
  const filePath = path.join(__dirname, '../src/assets/files/OrderID.csv'); // Path to your CSV file

  // Read the current CSV file
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading CSV file:', err);
      return res.status(500).send({ message: 'Error reading CSV file' });
    }

    // Parse the existing CSV data using PapaParse
    const parsedData = Papa.parse(data, { header: true, skipEmptyLines: true }).data;

    // Check if the new CartID already exists
    const existingItem = parsedData.find((item) => item.ORDER_ID === newOrderID);

    if (existingItem) {
      return res.status(400).send({ message: 'Cart ID already exists in the file' });
    }

    // If the CartID doesn't exist, append it to the CSV content
    const newCsvRow = `${newOrderID}\n`; // Format the new row for CSV
    const updatedCsvData = data.trim() + `\n${newOrderID}`; // Append the new row to the existing CSV data

    // Write the updated CSV data back to the file
    fs.writeFile(filePath, updatedCsvData, 'utf8', (err) => {
      if (err) {
        console.error('Error writing to CSV file:', err);
        return res.status(500).send({ message: 'Error updating CSV file' });
      }

      res.status(200).send({ message: 'CSV file updated successfully' });
    });
  });
});

app.post('/add-order', (req, res) => {
  const orderData = req.body.orderData; // Array of orders
  const filePath = path.join(__dirname, '../src/assets/files/Orders.csv'); // Path to your Orders CSV file

  // Read the existing CSV file
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading CSV file:', err);
      return res.status(500).send({ message: 'Error reading CSV file' });
    }

    // Parse the existing CSV data
    const parsedData = Papa.parse(data, { header: true, skipEmptyLines: true }).data;

    // Add new rows to the parsed data
    const updatedData = [...parsedData, ...orderData];

    // Convert the updated data back to CSV format
    const csvContent = Papa.unparse(updatedData);

    // Write the updated CSV data back to the file
    fs.writeFile(filePath, csvContent, 'utf8', (err) => {
      if (err) {
        console.error('Error writing to CSV file:', err);
        return res.status(500).send({ message: 'Error updating CSV file' });
      }

      res.status(200).send({ message: 'Order data saved successfully' });
    });
  });
});

app.post('/add-order-summary', (req, res) => {
  const summaryData = req.body.summaryData; // Order summary data
  const filePath = path.join(__dirname, '../src/assets/files/OrderSummary.csv'); // Path to the OrderSummary CSV file

  // Read the existing CSV file
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading CSV file:', err);
      return res.status(500).send({ message: 'Error reading CSV file' });
    }

    // Parse the existing CSV data
    const parsedData = Papa.parse(data, { header: true, skipEmptyLines: true }).data;

    // Add the new summary data
    parsedData.push(summaryData);

    // Convert the updated data back to CSV format
    const csvContent = Papa.unparse(parsedData);

    // Write the updated CSV data back to the file
    fs.writeFile(filePath, csvContent, 'utf8', (err) => {
      if (err) {
        console.error('Error writing to CSV file:', err);
        return res.status(500).send({ message: 'Error updating CSV file' });
      }

      res.status(200).send({ message: 'Order summary saved successfully' });
    });
  });
});

//Approve order.
app.post('/approve-order', (req, res) => {
  const { cartId } = req.body; // `cartId` identifies the order to approve
  const filePath = path.join(__dirname, '../src/assets/files/OrderSummary.csv'); // Path to the CSV file

  // Read the existing CSV file
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading CSV file:', err);
      return res.status(500).send({ message: 'Error reading CSV file' });
    }

    // Parse the existing CSV data
    const parsedData = Papa.parse(data, { header: true, skipEmptyLines: true });
    const orders = parsedData.data;

    // Find the order by cartId
    const orderIndex = orders.findIndex(order => order.CartID === cartId);
    if (orderIndex === -1) {
      return res.status(404).send({ message: 'Order not found' });
    }

    // Update the order status to "Approved"
    orders[orderIndex].OrderStatus = 'Approved';

    // Convert the updated data back to CSV format
    const csvContent = Papa.unparse(orders);

    // Write the updated CSV data back to the file
    fs.writeFile(filePath, csvContent, 'utf8', (err) => {
      if (err) {
        console.error('Error writing to CSV file:', err);
        return res.status(500).send({ message: 'Error updating CSV file' });
      }

      res.status(200).send({ message: 'Order approved successfully' });
    });
  });
});



//Ship order.
app.post('/ship-order', (req, res) => {
  const { cartId } = req.body; // `cartId` is the identifier for the order
  const filePath = path.join(__dirname, '../src/assets/files/OrderSummary.csv'); // Path to the CSV file

  // Read the existing CSV file
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading CSV file:', err);
      return res.status(500).send({ message: 'Error reading CSV file' });
    }

    // Parse the existing CSV data
    const parsedData = Papa.parse(data, { header: true, skipEmptyLines: true });
    const orders = parsedData.data;

    // Find the order by cartId
    const orderIndex = orders.findIndex(order => order.CartID === cartId);
    if (orderIndex === -1) {
      return res.status(404).send({ message: 'Order not found' });
    }

    // Update the order status to "Shipped"
    orders[orderIndex].OrderStatus = 'Shipped';

    // Convert the updated data back to CSV format
    const csvContent = Papa.unparse(orders);

    // Write the updated CSV data back to the file
    fs.writeFile(filePath, csvContent, 'utf8', (err) => {
      if (err) {
        console.error('Error writing to CSV file:', err);
        return res.status(500).send({ message: 'Error updating CSV file' });
      }

      res.status(200).send({ message: 'Order marked as shipped and email sent successfully' });
    });
  });
});

//#endregion

//#region "Reviews."
app.post('/add-review', (req, res) => {
  const reviewData = req.body; // Corrected
  const filePath = path.join(__dirname, '../src/assets/files/Reviews.csv');

  // Read the existing CSV file
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading CSV file:', err);
      return res.status(500).send({ message: 'Error reading CSV file' });
    }

    // Parse the existing CSV data
    const parsedData = Papa.parse(data, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim()
    }).data;

    // Validate incoming review data
    if (!reviewData.Name || !reviewData.Rating || !reviewData.Comment || !reviewData.ReviewDate || !reviewData.Email) {
      return res.status(400).send({ message: 'Invalid review data' });
    }

    // Add the new review data
    parsedData.push(reviewData);

    // Convert the updated data back to CSV format
    const csvContent = Papa.unparse(parsedData);

    // Write the updated CSV data back to the file
    fs.writeFile(filePath, csvContent, 'utf8', (err) => {
      if (err) {
        console.error('Error writing to CSV file:', err);
        return res.status(500).send({ message: 'Error updating CSV file' });
      }

      res.status(200).send({ message: 'Review added successfully' });
    });
  });
});

//#endregion

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
