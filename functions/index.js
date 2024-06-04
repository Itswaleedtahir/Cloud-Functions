const { exec } = require('child_process');
const {onRequest} = require("firebase-functions/v2/https");
const { Datas, pdf_email,labreport_data ,lab_report,labreport_email} = require("../functions/models/index");
const { Storage } = require('@google-cloud/storage');
const { Parser } = require('json2csv');
const path = require('path');
const fs = require('fs');

// Create a new storage client
const storage = new Storage({
  projectId: 'gp-data-1-0', // Replace with your project ID
  keyFilename: "../functions/gp-data-1-0-79c72abd30e3.json"// Path to your service account key file
});

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

exports.helloWorld = onRequest((request, response) => {
    const name = request.params[0]
    console.log("name",name)
    const items = {lamp:"this is a lamp",chair:"this is achair"}
    const message = items[name]
  response.send(`<h1>${message}</h1>`);
});

exports.runMigrations =onRequest((req, res) => {
  exec('npx sequelize-cli db:migrate', (error, stdout, stderr) => {
    if (error) {
      res.status(500).send(`Migration failed: ${stderr}`);
    } else {
      res.status(200).send(`Migration successful: ${stdout}`);
    }
  });
});

exports.dbhit = onRequest(async (req,res)=>{
  console.log("model",Datas)
  const { name, email } = req.body;
  const user = await Datas.create({
    name:name,
    email:email
  })
  return res.status(200).send("Created successfully")
})

exports.pdfEmail = onRequest(async (req,res)=>{
  console.log("pdfEmail",pdf_email)
  const {email}=req.body;
  const data = await pdf_email.create({
    emailAddress:email
  })
  res.status(200).send("created")
})
exports.LabReport= onRequest(async (req, res) => {
  try {
    const {protocolId,investigator,subjectId,dateOfCollection,timePoint,pdfEmailId }=req.body
    console.log("body",req.body)
  const data= await new lab_report({
    pdfEmailIdfk:pdfEmailId, protocolId,investigator,subjectId,dateOfCollection,timePoint
  }).save()
  console.log(data)
  return res.status(200).send("OK")
  } catch (error) {
    console.log(error)
    return res.status(500).send("Error: " + error)
  }
})

exports.LabReportData= onRequest(async (req, res) => {
      try {
        const {protocolId,key,value,refValue,isPendin}=req.body
      const labReoprtFk =1
      const data= await new labreport_data({
        labReoprtFk:labReoprtFk,
        key:key,
        value:value,
        refValue:refValue,
      }).save()
      console.log(data)
      return res.status(200).send("OK")
      } catch (error) {
        console.log(error)
        return res.status(500).send("Error: " + error)
      }
})

exports.MakeCSV = onRequest(async (req, res) => {
  const { id ,email,emailStatus} = req.body;

  try {
    // Fetch the data from the database
    const data = await labreport_data.findAll({
      where: {
        labReoprtFk: id,
      }
    });

    if (data.length === 0) {
      return res.status(404).send({ message: 'No data found' });
    }

    // Convert the data to JSON format
    const jsonData = data.map(record => record.toJSON());

    // Define fields for CSV, excluding labReoprtFk and protocolId
    const fields = ['id', 'key', 'value', 'refValue', 'isPending', 'createdAt', 'updatedAt'];
    const opts = { fields };

    // Convert JSON to CSV
    const parser = new Parser(opts);
    const csv = parser.parse(jsonData);

    // Generate timestamp
    const timestamp = new Date().toISOString().replace(/[-:.]/g, "").replace("T", "_").replace("Z", "");

    // Define the path to save the CSV file in the uploads folder
    const uploadsDir = path.join(__dirname, 'uploads');
    
    // Ensure the uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir);
    }

    // Name the file based on labreportid fk and timestamp
    const filePath = path.join(uploadsDir, `report_${id}_${timestamp}.csv`);
    
    // Save the CSV file
    fs.writeFileSync(filePath, csv);

    // Upload the file to Google Cloud Storage
    const bucketName = 'gpdata01'; // Replace with your bucket name
    const destination = `reports/report_${id}_${timestamp}.csv`;

    await storage.bucket(bucketName).upload(filePath, {
      destination: destination,
      metadata: {
        contentType: 'text/csv',
      }
    });

    // Optionally, you can delete the local file after uploading
    fs.unlinkSync(filePath);
    await labreport_email.create({
      labReoprtFk: id,
      csvPath: destination,
      email:email,
      emailStatus:emailStatus
    });

    // Respond with the URL to the uploaded file
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;

    return res.status(200).send({ message: 'CSV file created and uploaded', url: publicUrl });
  } catch (error) {
    console.error('Error creating or uploading CSV:', error);
    return res.status(500).send({ message: 'Internal server error' });
  }
});