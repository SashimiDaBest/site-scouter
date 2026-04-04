import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.tensorboard import SummaryWriter
from datetime import datetime
import dataset
import statistics

batch_size = 32
train_loader, test_loader, ds_size = dataset.get_data(batch_size=batch_size)


import torch.nn as nn
import torch.nn.functional as F

# PyTorch models inherit from torch.nn.Module
class Habakkuk(nn.Module):
    def __init__(self, input_size):
        super(Habakkuk, self).__init__()
        self.fc1 = nn.Linear(input_size, 24)
        self.fc2 = nn.Linear(24, 12)
        self.fc3 = nn.Linear(12, 6)
        self.fc4 = nn.Linear(6, 1)

    def forward(self, x):
        x = F.relu(self.fc1(x))
        x = F.relu(self.fc2(x))
        x = F.relu(self.fc3(x))
        x = self.fc4(x)
        return x

def train_one_epoch(model, optimizer, loss_fn):
    running_loss = 0.
    last_loss = 0.

    # Here, we use enumerate(training_loader) instead of
    # iter(training_loader) so that we can track the batch
    # index and do some intra-epoch reporting

    i = 0
    for inputs, labels in train_loader:

        inputs = inputs.float()
        labels = labels.float()
        # Every data instance is an input + label pair


        # Zero your gradients for every batch!
        optimizer.zero_grad()

        # Make predictions for this batch
        outputs = model(inputs)

        # Compute the loss and its gradients
        loss = loss_fn(outputs, labels)
        loss.backward()

        # Adjust learning weights
        optimizer.step()

        # Gather data and report
        running_loss += loss.item()
        if i % batch_size == batch_size - 1:
            last_loss = running_loss / batch_size # loss per batch
            print('  batch {} loss: {}'.format(i + 1, last_loss))
            running_loss = 0.
        i+=1
    return last_loss

def train_loop():

    print("Habakkuk!")
    print(ds_size)

    model = Habakkuk(ds_size)
    # loss function and optimizer
    loss_fn = nn.MSELoss()  # mean square error
    optimizer = optim.Adam(model.parameters(), lr=0.001)

    # Initializing in a separate cell so we can easily add more epochs to the same run
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    writer = SummaryWriter('runs/habakkuk_{}'.format(timestamp))

    EPOCHS = 10

    print("started!")

    for epoch in range(0, EPOCHS):

        print('EPOCH {}:'.format(epoch + 1))

        # Make sure gradient tracking is on, and do a pass over the data
        model.train(True)
        avg_loss = train_one_epoch(epoch, writer, model, optimizer, loss_fn)

        print('LOSS train {}'.format(avg_loss))



    running_vloss = 0.0
    # Set the model to evaluation mode, disabling dropout and using population
    # statistics for batch normalization.
    model.eval()

    # Disable gradient computation and reduce memory consumption.
    with torch.no_grad():
        for i, vdata in enumerate(test_loader):
            vinputs, vlabels = vdata
            voutputs = model(vinputs)
            vloss = loss_fn(voutputs, vlabels)
            running_vloss += vloss
                
    avg_vloss = running_vloss / (i + 1)
    avg_r2 = 1 - avg_vloss / statistics.pvariance([item for sublist in vlabels.tolist() for item in sublist])
    print('LOSS valid {} r2 {}'.format(avg_vloss, avg_r2))

    return model
    
train_loop()