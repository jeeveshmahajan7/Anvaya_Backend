const express = require("express");
const cors = require("cors");
require("dotenv").config();
const mongoose = require("mongoose");
const { body, query, validationResult } = require("express-validator");

const { initializeDatabase } = require("./db/db.connect");
const AnvayaLead = require("./models/lead.model");
const AnvayaSalesAgent = require("./models/salesAgent.model");
const AnvayaComment = require("./models/comment.model");

const app = express();

// CORS setup
const corsOptions = {
  origin: "*",
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(express.json());
app.use(cors(corsOptions));

// Initialize Database
initializeDatabase()
  .then(() => console.log("✅ Connected to the database."))
  .catch((error) => {
    console.error("❌ Failed to connect to the database:", error.message);
  });

// endpoints
// base route
app.get("/", async (req, res) => {
  try {
    res.status(200).json({ message: "✅ Anvaya backend is operational." });
  } catch (error) {
    console.log("❌ Anvaya backend deployment unsuccessful.");
  }
});

// 1. LEADS API
// validation middleware (to allow only valid data for lead creation)
const validateLead = [
  body("name")
    .notEmpty()
    .isString()
    .withMessage("Name is required.")
    .isLength({ min: 2 }),
  body("salesAgent")
    .optional()
    .isMongoId()
    .withMessage("Sales Agent must be a valid Object Id."),
  body("status")
    .isIn(["New", "Contacted", "Qualified", "Proposal Sent", "Closed"])
    .withMessage("Invalid Status Value"),
  body("priority")
    .optional()
    .isIn(["High", "Medium", "Low"])
    .withMessage("Priority must be High, Medium, or Low."),
  body("timeToClose")
    .optional()
    .isNumeric()
    .withMessage("Time to Close must be a number."),
];

// a. Create a New Lead
const createNewLead = async (newLead) => {
  try {
    const lead = new AnvayaLead(newLead);
    const saveLead = await lead.save();
    return saveLead;
  } catch (error) {
    throw new Error(error.message);
  }
};

app.post("/leads", validateLead, async (req, res) => {
  // data validation before creating lead
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const newLead = await createNewLead(req.body);

    let agentData = null;
    if (newLead.salesAgent) {
      if (!mongoose.Types.ObjectId.isValid(newLead.salesAgent)) {
        return res.status(400).json({
          error: "Invalid input: 'salesAgent' must be a valid ObjectId.",
        });
      }

      agentData = await AnvayaSalesAgent.findById(newLead.salesAgent).lean();
      if (!agentData) {
        return res.status(404).json({
          error: `Sales agent with ID ${newLead.salesAgent} not found.`,
        });
      }
    }

    if (newLead) {
      res
        .status(201)
        .json({ message: "✅ Successfully created new Lead.", lead: newLead });
    } else {
      res.status(400).json({ message: "❗️Invalid lead data." });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating the lead", error: error.message });
  }
});

// b. Get all Leads
const findAllLeads = async () => {
  try {
    const leads = await AnvayaLead.find().populate("salesAgent");
    return leads;
  } catch (error) {
    throw new Error(error.message);
  }
};

app.get("/leads", async (req, res) => {
  try {
    const leads = await findAllLeads();
    if (leads.length > 0) {
      return res.json({
        message: "✅ Successfully fetched leads.",
        leads: leads,
      });
    } else {
      return res.status(400).json({ message: "❗️Invalid input." });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "❌ Error fetching leads.", error: error.message });
  }
});

// c. Update a Lead
const updateLeadById = async (leadId, updateData) => {
  try {
    const updatedLead = await AnvayaLead.findByIdAndUpdate(leadId, updateData, {
      new: true, // return updated doc
      runValidators: true, // enforce schema validation
    });
    return updatedLead;
  } catch (error) {
    throw new Error(error.message);
  }
};

app.put("/leads/:id", validateLead, async (req, res) => {
  // validate lead data before updating
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const leadId = req.params.id;
    const updateData = req.body;

    // validate lead id format
    if (!mongoose.Types.ObjectId.isValid(leadId)) {
      return res.status(400).json({ message: "❗️ Invalid lead id." });
    }

    const updatedLead = await updateLeadById(leadId, updateData);

    if (!updatedLead) {
      return res
        .status(404)
        .json({ message: `❌ Lead with ID ${leadId} not found.` });
    }

    res.status(200).json({
      message: "✅ Lead updated successfully.",
      updatedLead,
    });
  } catch (error) {
    res.status(500).json({ message: "❌ Failed to update lead." });
  }
});

// d. Delete a Lead
const deleteLeadById = async (leadId) => {
  try {
    const deletedLead = await AnvayaLead.findByIdAndDelete(leadId);
    return deletedLead;
  } catch (error) {
    throw new Error(error.message);
  }
};

app.delete("/leads/:id", async (req, res) => {
  try {
    const leadId = req.params.id;
    // validate object id
    if (!mongoose.Types.ObjectId.isValid(leadId)) {
      return res.status(400).json({ message: "❌ The lead id is invalid." });
    }

    const deletedLead = await deleteLeadById(leadId);

    if (!deletedLead) {
      return res
        .status(404)
        .json({ error: `Lead with Id ${leadId} not found` });
    }

    res.status(200).json({
      message: "✅ Lead deleted successfully.",
      deletedLead,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "❌ Failed to delete the lead.", error: error.message });
  }
});

// 2. SALES AGENT API
// validation middleware (to validate Sales Agent data before agent creation)
const validateAgent = [
  body("name")
    .notEmpty()
    .isString()
    .withMessage("Name is required")
    .isLength({ min: 2 }),
  body("email").notEmpty().isEmail().withMessage("Invalid email format."),
];

// a. Create a New Sales Agent
const createSalesAgent = async (newAgent) => {
  try {
    const agent = new AnvayaSalesAgent(newAgent);
    const saveAgent = await agent.save();
    return saveAgent;
  } catch (error) {
    throw new Error(error.message);
  }
};

app.post("/agents", validateAgent, async (req, res) => {
  // data validation (before creating agent)
  const erros = validationResult(req);
  if (!erros.isEmpty()) {
    return res.status(400).json({ erros: erros.array() });
  }

  try {
    const newAgent = await createSalesAgent(req.body);
    if (newAgent) {
      res.status(201).json({ message: "✅ Sales Agent added successfully." });
    } else {
      res.status(400).json({ message: "❗️ Invalid agent details." });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "❌ Error Adding Sales Agent.", error: error.message });
  }
});

// b. Fetch all Sales Agent
const fetchSalesAgents = async () => {
  try {
    const agents = await AnvayaSalesAgent.find();
    return agents;
  } catch (error) {
    throw new Error(error.message);
  }
};

app.get("/agents", async (req, res) => {
  try {
    const agents = await fetchSalesAgents();
    if (agents.length > 0) {
      res.status(200).json({
        message: "✅ Successfully fetched all Sales Agents.",
        agents: agents,
      });
    } else {
      res
        .status(404)
        .json({ message: "❌ Agents not found.", error: error.message });
    }
  } catch (error) {
    res.status(500).json({
      message: "❌ Failed to fetch Sales Agents:",
      error: error.message,
    });
  }
});

// 3. Comments API
// a. Add a New Comment
const createNewComment = async (leadId, requestBody) => {
  try {
    const newComment = new AnvayaComment({
      lead: leadId,
      author: requestBody.author || "6903b32407758bda66dce80a",
      commentText: requestBody.commentText,
    });
    const savedComment = await newComment.save();
    await savedComment.populate("author", "name");
    return savedComment;
  } catch (error) {
    throw new Error(error.message);
  }
};

app.post("/leads/:id/comments", async (req, res) => {
  try {
    const leadId = req.params.id;

    // validate comment text
    if (!req.body.commentText || typeof req.body.commentText !== "string") {
      return res
        .status(400)
        .json({ message: "commentText is required and must be a string" });
    }

    // validate lead id
    const lead = await AnvayaLead.findById(leadId);
    if (!lead) {
      return res
        .status(404)
        .json({ error: `Lead with Id ${leadId} not found` });
    }

    // save the comment
    const comment = await createNewComment(leadId, req.body);

    if (comment) {
      res.status(201).json({
        message: "✅ Successfully added a new comment.",
        id: comment._id,
        commentText: comment.commentText,
        author: comment.author ? comment.author.name : null,
        createdAt: comment.createdAt,
      });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "❌ Failed to add a comment.", error: error.message });
  }
});

// b. Fetch All Comments for a Lead
const fetchAllComments = async (leadId) => {
  try {
    const comments = await AnvayaComment.find({ lead: leadId }) // filter by Id
      .populate("author", "name email") // show author details
      .sort({ createdAt: -1 }); // latest first

    return comments;
  } catch (error) {
    throw new Error(error.message);
  }
};

app.get("/leads/:id/comments", async (req, res) => {
  try {
    const leadId = req.params.id;
    // validate objectId
    if (!mongoose.Types.ObjectId.isValid(leadId)) {
      return res.status(400).json({ error: "Invalid lead Id." });
    }

    // check for lead presence
    const lead = await AnvayaLead.findById(leadId);
    if (!lead) {
      return res
        .status(404)
        .json({ error: `Lead with Id ${leadId} not found.` });
    }

    const comments = await fetchAllComments(leadId);
    res.status(200).json({
      message: `✅ Successfully fetched the comments for lead with Id ${leadId}`,
      comments: comments,
    });
  } catch (error) {
    res.status(500).json({
      message: "❌ Failed to fetch comments for requested lead.",
      error: error.message,
    });
  }
});

// 4. Reporting API
// a. Fetch leads closed last week
const fetchLastWeekReport = async () => {
  try {
    // get today's & 7 days ago date
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);

    const report = await AnvayaLead.find({
      status: "Closed",
      closedAt: { $gte: sevenDaysAgo, $lte: today },
    }).sort({ closedAt: -1 });

    return report;
  } catch (error) {
    throw new Error(error.message);
  }
};

app.get("/report/last-week", async (req, res) => {
  try {
    const report = await fetchLastWeekReport();
    return res.status(200).json({
      message: "✅ Leads closed within last week fetched successfully.",
      leads: report,
    });
  } catch (error) {
    res.status(500).json({
      message: "❌ Failed to fetch leads closed last week.",
      error: error.message,
    });
  }
});

app.get("/report/pipeline", async (req, res) => {
  try {
    const totalLeads = await AnvayaLead.countDocuments();

    return res.status(200).json({
      message: "✅ Fetched total leads in the pipeline.",
      totalLeadsInPipeline: totalLeads,
    });
  } catch (error) {
    res.status(500).json({
      message: "❌ Failed to fetch total leads in pipeline.",
      error: error.message,
    });
  }
});

// Export app for serverless platforms like Vercel - to start the server
module.exports = app;

// Start server only for local development
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`🚀 Server running on PORT: ${PORT}`));
}
